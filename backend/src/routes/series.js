import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { admin, fail, uuid } from "../security.js";
import { accessibleVideo, dto, selectVideo, visibleVideo } from "../catalog.js";
const seasonData = z.object({
  number: z.number().int().min(1).max(1000),
  title: z.string().trim().max(160).default(""),
}).strict();
const episodeData = z.object({
  seasonId: uuid,
  episodeNumber: z.number().int().min(1).max(10000),
}).strict();
export default async function seriesRoutes(app) {
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
