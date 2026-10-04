import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import sharp from "sharp";
import { query, transaction } from "../db.js";
import { config } from "../config.js";
import { admin, fail, uuid } from "../security.js";
import { accessibleVideo, dto, listVideos } from "../catalog.js";
import { spoolRoot, putFile, sendMedia } from "../storage.js";
import { externalUrl, resolveExternal } from "../external.js";
import { probe } from "../media.js";
const listing = z.object({
  contentType: z.enum(["movie", "series"]).optional(),
  q: z.string().max(120).optional(),
  category: uuid.optional(),
  sort: z.enum(["recent", "popular"]).default("recent"),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
});
const metadata = z
  .object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(10000).default(""),
    categoryId: uuid,
    published: z.boolean().default(false),
    releaseYear: z.number().int().min(1888).max(2100).nullable().optional(),
  })
  .strict();
const creation = metadata.extend({
  contentType: z.enum(["movie", "series", "episode"]).default("movie"),
  seasonId: uuid.optional(),
  episodeNumber: z.number().int().min(1).max(10000).optional(),
  sourceType: z.enum(["upload", "external", "collection"]).default("upload"),
  externalUrl: externalUrl.optional(),
  duration: z.number().finite().min(0).max(43200).default(0),
}).superRefine((data, ctx) => {
  if (data.sourceType === "collection" && data.contentType !== "series")
    ctx.addIssue({ code: "custom", path: ["contentType"], message: "Uma coleção precisa ser uma série." });
  if ((data.contentType === "episode") !== (data.seasonId !== undefined && data.episodeNumber !== undefined)
      || (data.contentType !== "episode" && (data.seasonId !== undefined || data.episodeNumber !== undefined)))
    ctx.addIssue({ code: "custom", path: ["seasonId"], message: "Episódios exigem temporada e número. Filmes e séries não aceitam esses campos." });
  if ((data.sourceType === "external") !== Boolean(data.externalUrl))
    ctx.addIssue({ code: "custom", path: ["externalUrl"], message: "Vídeo externo exige uma URL; upload não aceita URL externa." });
});
const editing = metadata.extend({
  contentType: z.enum(["movie", "series", "episode"]).optional(),
  externalUrl: externalUrl.optional(),
  duration: z.number().finite().min(0).max(43200).optional(),
});
async function makeThumbnail(buffer, target) {
  try {
    const image = sharp(buffer, { limitInputPixels: 20000000 });
    const info = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(info.format))
      fail(400, "Formato de imagem inválido.");
    await image
      .rotate()
      .resize(1280, 720, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(target);
  } catch {
    fail(
      400,
      "Thumbnail inválida. Envie uma imagem JPG, PNG ou WebP de até 20 megapixels.",
    );
  }
}
export default async function videoRoutes(app) {
  app.get("/api/videos", (req) =>
    listVideos(req.user, listing.parse(req.query)),
  );
  app.get("/api/search", (req) =>
    listVideos(req.user, listing.parse(req.query)),
  );
  app.get("/api/admin/videos", { preHandler: admin }, (req) =>
    listVideos(req.user, listing.parse(req.query), true),
  );
  app.get("/api/videos/:id", async (req) =>
    dto(await accessibleVideo(uuid.parse(req.params.id), req.user)),
  );
  app.post(
    "/api/videos",
    {
      preHandler: admin,
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    },
    async (req, reply) => {
      const id = randomUUID(),
        directory = path.join(spoolRoot, id);
      await mkdir(directory, { recursive: true });
      let hasVideo = false,
        customThumbnail = false;
      const fields = Object.create(null);
      try {
        for await (const part of req.parts({
          limits: {
            fileSize: config.MAX_UPLOAD_MB * 1024 * 1024,
            files: 2,
            fields: 14,
            parts: 16,
            fieldSize: 12000,
          },
        })) {
          if (part.type === "file") {
            if (part.fieldname === "video" && !hasVideo) {
              if (!/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(part.filename))
                fail(400, "Envie um arquivo MP4, MOV, MKV, AVI ou WebM.");
              await pipeline(
                part.file,
                createWriteStream(path.join(directory, "source")),
              );
              if (part.file.truncated)
                fail(413, "Vídeo maior que o limite configurado.");
              hasVideo = true;
            } else if (part.fieldname === "thumbnail" && !customThumbnail) {
              let size = 0;
              const chunks = [];
              for await (const chunk of part.file) {
                size += chunk.length;
                if (size > 10 * 1024 * 1024)
                  fail(413, "Thumbnail deve ter até 10 MB.");
                chunks.push(chunk);
              }
              if (part.file.truncated) fail(413, "Thumbnail muito grande.");
              await makeThumbnail(
                Buffer.concat(chunks),
                path.join(directory, "thumbnail.jpg"),
              );
              customThumbnail = true;
            } else fail(400, "Campo de arquivo desconhecido ou duplicado.");
          } else {
            if (part.valueTruncated || Object.hasOwn(fields, part.fieldname))
              fail(400, "Campo inválido ou duplicado.");
            fields[part.fieldname] = part.value;
          }
        }
        if (!["true", "false", undefined].includes(fields.published))
          fail(400, "Valor de publicação inválido.");
        const data = creation.parse({
          ...fields,
          episodeNumber: fields.episodeNumber === undefined ? undefined : Number(fields.episodeNumber),
          duration: fields.duration === undefined ? 0 : Number(fields.duration),
          published: fields.published === "true",
          releaseYear: fields.releaseYear === undefined || fields.releaseYear === "" ? null : Number(fields.releaseYear),
        });
        if (data.sourceType === "collection") {
          if (hasVideo) fail(400, "Cadastre os arquivos nos episódios, não na série.");
          if (customThumbnail)
            await putFile(config.STORAGE_DRIVER, `${id}/thumbnail.jpg`, path.join(directory, "thumbnail.jpg"));
          try {
            await query(
              "INSERT INTO videos(id,title,description,category_id,owner_id,published,storage_driver,custom_thumbnail,source_type,content_type,status,published_at,release_year) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'collection','series','ready',CASE WHEN $6 THEN now() ELSE NULL END,$9)",
              [id, data.title, data.description, data.categoryId, req.user.id, data.published, config.STORAGE_DRIVER, customThumbnail, data.releaseYear ?? null],
            );
          } catch (error) {
            if (customThumbnail) await query("INSERT INTO media_gc(id,storage_driver) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, config.STORAGE_DRIVER]);
            throw error;
          }
          await rm(directory, { recursive: true, force: true });
          return reply.code(201).send({ id, status: "ready" });
        }
        if (data.sourceType === "external") {
          if (hasVideo) fail(400, "Vídeo externo não aceita arquivo de vídeo.");
          const reference = await resolveExternal(data.externalUrl);
          if (customThumbnail)
            await putFile(config.STORAGE_DRIVER, `${id}/thumbnail.jpg`, path.join(directory, "thumbnail.jpg"));
          try {
            await query(
              "INSERT INTO videos(id,title,description,category_id,owner_id,published,storage_driver,custom_thumbnail,source_type,provider_id,external_path,duration,status,published_at,content_type,season_id,episode_number,release_year) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'external',$9,$10,$11,'ready',CASE WHEN $6 THEN now() ELSE NULL END,$12,$13,$14,$15)",
              [id, data.title, data.description, data.categoryId, req.user.id, data.published, config.STORAGE_DRIVER, customThumbnail, reference.providerId, reference.externalPath, data.duration, data.contentType, data.seasonId ?? null, data.episodeNumber ?? null, data.releaseYear ?? null],
            );
          } catch (error) {
            if (customThumbnail) await query("INSERT INTO media_gc(id,storage_driver) VALUES($1,$2) ON CONFLICT DO NOTHING", [id, config.STORAGE_DRIVER]);
            throw error;
          }
          await rm(directory, { recursive: true, force: true });
          return reply.code(201).send({ id, status: "ready" });
        }
        if (!hasVideo) fail(400, "Selecione um vídeo.");
        try {
          await probe(path.join(directory, "source"));
        } catch {
          fail(400, "Arquivo de vídeo inválido ou formato não suportado.");
        }
        await query(
          "INSERT INTO videos(id,title,description,category_id,owner_id,published,storage_driver,custom_thumbnail,content_type,season_id,episode_number,release_year) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
          [
            id,
            data.title,
            data.description,
            data.categoryId,
            req.user.id,
            data.published,
            config.STORAGE_DRIVER,
            customThumbnail,
            data.contentType,
            data.seasonId ?? null,
            data.episodeNumber ?? null,
            data.releaseYear ?? null,
          ],
        );
        return reply
          .code(202)
          .send({
            id,
            status: "queued",
            message: "Upload recebido. O processamento começou na fila.",
          });
      } catch (error) {
        await rm(directory, { recursive: true, force: true });
        throw error;
      }
    },
  );
  app.put("/api/videos/:id", { preHandler: admin }, async (req) => {
    const id = uuid.parse(req.params.id),
      data = editing.parse(req.body);
    const current = await accessibleVideo(id, req.user);
    if (current.source_type !== "external" && (data.externalUrl !== undefined || data.duration !== undefined))
      fail(400, "URL e duração manual são exclusivas de vídeos externos.");
    const reference = data.externalUrl === undefined ? null : await resolveExternal(data.externalUrl);
    const result = await query(
      "UPDATE videos SET title=$2,description=$3,category_id=$4,published=$5,provider_id=COALESCE($6,provider_id),external_path=COALESCE($7,external_path),duration=COALESCE($8,duration),content_type=COALESCE($9,content_type),release_year=CASE WHEN $11::boolean THEN $10 ELSE release_year END,published_at=CASE WHEN $5 AND status='ready' THEN COALESCE(published_at,now()) ELSE published_at END,updated_at=now() WHERE id=$1 RETURNING id",
      [id, data.title, data.description, data.categoryId, data.published, reference?.providerId ?? null, reference?.externalPath ?? null, data.duration ?? null, data.contentType ?? null, data.releaseYear ?? null, data.releaseYear !== undefined],
    );
    if (!result.rowCount) fail(404, "Vídeo não encontrado.");
    return dto(await accessibleVideo(id, req.user));
  });
  app.post("/api/videos/:id/thumbnail", { preHandler: admin }, async (req) => {
    const id = uuid.parse(req.params.id),
      directory = path.join(config.STORAGE_DIR, "temp");
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${randomUUID()}.jpg`);
    try {
      const part = await req.file({
        limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 },
      });
      if (!part || part.fieldname !== "thumbnail")
        fail(400, "Envie uma thumbnail.");
      await makeThumbnail(await part.toBuffer(), file);
      await transaction(async (db) => {
        const {
          rows: [video],
        } = await db.query("SELECT * FROM videos WHERE id=$1 FOR UPDATE", [id]);
        if (!video) fail(404, "Vídeo não encontrado.");
        if (video.status !== "ready")
          fail(409, "Aguarde o processamento antes de trocar a thumbnail.");
        await putFile(video.storage_driver, `${id}/thumbnail.jpg`, file);
        await db.query(
          "UPDATE videos SET custom_thumbnail=true,updated_at=now() WHERE id=$1",
          [id],
        );
      });
      return { ok: true };
    } finally {
      await rm(file, { force: true });
    }
  });
  app.post("/api/videos/:id/retry", { preHandler: admin }, async (req) => {
    const result = await query(
      "UPDATE videos SET status='queued',processing_error=NULL,updated_at=now() WHERE id=$1 AND status='failed' RETURNING id",
      [uuid.parse(req.params.id)],
    );
    if (!result.rowCount)
      fail(409, "Somente vídeos com falha podem ser reprocessados.");
    return { ok: true };
  });
  app.delete("/api/videos/:id", { preHandler: admin }, async (req) => {
    const id = uuid.parse(req.params.id);
    await transaction(async (db) => {
      const {
        rows: [video],
      } = await db.query("SELECT * FROM videos WHERE id=$1 FOR UPDATE", [id]);
      if (!video) fail(404, "Vídeo não encontrado.");
      if (video.status === "processing")
        fail(409, "Aguarde o processamento terminar antes de excluir.");
      await db.query(
        "INSERT INTO media_gc(id,storage_driver) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [id, video.storage_driver],
      );
      await db.query("DELETE FROM videos WHERE id=$1", [id]);
    });
    return { ok: true };
  });
  app.get(
    "/api/media/:id/*",
    { config: { rateLimit: false } },
    async (req, reply) => {
      const id = uuid.parse(req.params.id),
        file = req.params["*"];
      if (
        !/^(master\.m3u8|playback\.mp4|thumbnail\.jpg|\d{1,4}\/(index\.m3u8|segment-\d{5,}\.ts))$/.test(
          file,
        )
      )
        fail(404, "Arquivo não encontrado.");
      const video = await accessibleVideo(id, req.user);
      if (video.status !== "ready")
        fail(404, "Vídeo ainda não está disponível.");
      return sendMedia(reply, req, video.storage_driver, `${id}/${file}`);
    },
  );
  app.get("/api/admin/stats", { preHandler: admin }, async () => {
    const {
      rows: [stats],
    } = await query(
      "SELECT (SELECT count(*)::int FROM videos) AS videos,(SELECT count(*)::int FROM categories) AS categories,(SELECT COALESCE(sum(views),0)::bigint FROM videos) AS views,(SELECT count(*)::int FROM videos WHERE status IN ('queued','processing')) AS processing",
    );
    return {
      ...stats,
      views: Number(stats.views),
      maxUploadMB: config.MAX_UPLOAD_MB,
    };
  });
}
