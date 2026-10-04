import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "../config.js";
import { query, transaction } from "../db.js";
import { admin, fail, uuid } from "../security.js";
import { accessibleVideo, dto, selectVideo, visibleVideo, listVideos } from "../catalog.js";
const seasonData = z.object({
  number: z.number().int().min(1).max(1000),
  title: z.string().trim().max(160).default(""),
}).strict();
const episodeData = z.object({
  seasonId: uuid,
  episodeNumber: z.number().int().min(1).max(10000),
}).strict();
const seriesMetadata = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10000).default(""),
  categoryId: uuid,
  published: z.boolean().default(false),
  releaseYear: z.number().int().min(1888).max(2100).nullable().optional(),
  episodeCoverDefault: z.boolean().optional(),
}).strict();
export default async function seriesRoutes(app) {
  app.get("/api/admin/series", { preHandler: admin }, async (req) => {
    const filter = z.object({
      q: z.string().max(120).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).max(1000000).default(0),
    }).parse(req.query);
    const result = await listVideos(req.user, { ...filter, contentType: "series" }, true);
    const { rows } = await query(`SELECT v.id,
      (SELECT count(*)::int FROM seasons WHERE series_id=v.id) AS seasons,
      (SELECT count(*)::int FROM videos e JOIN seasons s ON s.id=e.season_id WHERE s.series_id=v.id) AS episodes
      FROM videos v WHERE v.id=ANY($1::uuid[])`, [result.items.map((v) => v.id)]);
    const counts = new Map(rows.map((r) => [r.id, r]));
    return { ...result, items: result.items.map((v) => ({ ...v, seasonCount: counts.get(v.id)?.seasons || 0, episodeCount: counts.get(v.id)?.episodes || 0 })) };
  });
  app.post("/api/series", { preHandler: admin }, async (req, reply) => {
    const data = seriesMetadata.extend({ firstSeason: z.boolean().default(true) }).parse(req.body);
    const id = randomUUID();
    await transaction(async (db) => {
      await db.query("INSERT INTO videos(id,title,description,category_id,owner_id,published,storage_driver,source_type,content_type,status,published_at,release_year,episode_cover_default) VALUES($1,$2,$3,$4,$5,$6,$7,'collection','series','ready',CASE WHEN $6 THEN now() ELSE NULL END,$8,$9)",
        [id, data.title, data.description, data.categoryId, req.user.id, data.published, config.STORAGE_DRIVER, data.releaseYear ?? null, data.episodeCoverDefault ?? true]);
      if (data.firstSeason) await db.query("INSERT INTO seasons(id,series_id,number) VALUES($1,$2,1)", [randomUUID(), id]);
    });
    return reply.code(201).send(dto(await accessibleVideo(id, req.user)));
  });
  app.put("/api/series/:id", { preHandler: admin }, async (req) => {
    const id = uuid.parse(req.params.id), data = seriesMetadata.parse(req.body);
    const result = await query("UPDATE videos SET title=$2,description=$3,category_id=$4,published=$5,published_at=CASE WHEN $5 AND status='ready' THEN COALESCE(published_at,now()) ELSE published_at END,release_year=CASE WHEN $8::boolean THEN $6 ELSE release_year END,episode_cover_default=COALESCE($7,episode_cover_default),updated_at=now() WHERE id=$1 AND content_type='series' RETURNING id",
      [id, data.title, data.description, data.categoryId, data.published, data.releaseYear ?? null, data.episodeCoverDefault ?? null, data.releaseYear !== undefined]);
    if (!result.rowCount) fail(404, "Série não encontrada.");
    return dto(await accessibleVideo(id, req.user));
  });
  app.get("/api/series/:id/seasons", async (req) => {
    const id = uuid.parse(req.params.id);
    const series = await accessibleVideo(id, req.user);
    if (series.content_type !== "series") fail(404, "Série não encontrada.");
    const { rows: seasons } = await query("SELECT * FROM seasons WHERE series_id=$1 ORDER BY number", [id]);
    const { rows: episodes } = await query(
      `${selectVideo} WHERE s.series_id=$2 AND ($3 OR (${visibleVideo})) ORDER BY s.number,v.episode_number`,
      [req.user.id, id, req.user.role === "admin"],
    );
    return { items: seasons.map((s) => ({ id: s.id, seriesId: id, number: s.number, title: s.title,
      episodes: episodes.filter((e) => e.season_id === s.id).map(dto),
    })).filter((s) => req.user.role === "admin" || s.episodes.length) };
  });
  app.post("/api/series/:id/seasons", { preHandler: admin }, async (req, reply) => {
    const seriesId = uuid.parse(req.params.id), data = seasonData.parse(req.body);
    const series = await accessibleVideo(seriesId, req.user);
    if (series.content_type !== "series") fail(409, "Somente séries podem ter temporadas.");
    const id = randomUUID();
    await query("INSERT INTO seasons(id,series_id,number,title) VALUES($1,$2,$3,$4)", [id, seriesId, data.number, data.title]);
    return reply.code(201).send({ id, seriesId, ...data });
  });
  app.put("/api/seasons/:id", { preHandler: admin }, async (req) => {
    const id = uuid.parse(req.params.id), data = seasonData.parse(req.body);
    const result = await query("UPDATE seasons SET number=$2,title=$3 WHERE id=$1", [id, data.number, data.title]);
    if (!result.rowCount) fail(404, "Temporada não encontrada.");
    return { id, ...data };
  });
  app.delete("/api/seasons/:id", { preHandler: admin }, async (req) => {
    // RESTRICT preserves episodes/media. The administrator must move/delete them first.
    const result = await query("DELETE FROM seasons WHERE id=$1", [uuid.parse(req.params.id)]);
    if (!result.rowCount) fail(404, "Temporada não encontrada.");
    return { ok: true };
  });
  app.put("/api/episodes/:id", { preHandler: admin }, async (req) => {
    const id = uuid.parse(req.params.id), data = episodeData.parse(req.body);
    await transaction(async (db) => {
      const { rows: [video] } = await db.query("SELECT * FROM videos WHERE id=$1 FOR UPDATE", [id]);
      if (!video) fail(404, "Vídeo não encontrado.");
      if (video.content_type === "series") fail(409, "Uma série não pode ser vinculada como episódio. Use um filme ou episódio.");
      const { rows: [season] } = await db.query("SELECT id FROM seasons WHERE id=$1 FOR KEY SHARE", [data.seasonId]);
      if (!season) fail(404, "Temporada não encontrada.");
      await db.query("UPDATE videos SET content_type='episode',season_id=$2,episode_number=$3,updated_at=now() WHERE id=$1", [id, data.seasonId, data.episodeNumber]);
    });
    return dto(await accessibleVideo(id, req.user));
  });
}
