import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "../db.js";
import { admin, uuid, fail } from "../security.js";
import { listVideos, accessibleVideo } from "../catalog.js";
export default async function libraryRoutes(app) {
  app.get("/api/categories", async () => ({
    items: (await query("SELECT id,name FROM categories ORDER BY name")).rows,
  }));
  const category = z
    .object({ name: z.string().trim().min(1).max(80) })
    .strict();
  app.post("/api/categories", { preHandler: admin }, async (req, reply) => {
    const { name } = category.parse(req.body),
      id = randomUUID();
    await query("INSERT INTO categories(id,name) VALUES($1,$2)", [id, name]);
    return reply.code(201).send({ id, name });
  });
  app.put("/api/categories/:id", { preHandler: admin }, async (req) => {
    const { name } = category.parse(req.body),
      id = uuid.parse(req.params.id);
    if (
      !(await query("UPDATE categories SET name=$2 WHERE id=$1", [id, name]))
        .rowCount
    )
      fail(404, "Categoria não encontrada.");
    return { id, name };
  });
  app.delete("/api/categories/:id", { preHandler: admin }, async (req) => {
    if (
      !(
        await query("DELETE FROM categories WHERE id=$1", [
          uuid.parse(req.params.id),
        ])
      ).rowCount
    )
      fail(404, "Categoria não encontrada.");
    return { ok: true };
  });
  const pagination = z.object({
    contentType: z.enum(["movie", "series"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(24),
    offset: z.coerce.number().int().min(0).max(1000000).default(0),
  });
  app.get("/api/history", (req) =>
    listVideos(req.user, { ...pagination.parse(req.query), kind: "history" }),
  );
  app.get("/api/favorites", (req) =>
    listVideos(req.user, { ...pagination.parse(req.query), kind: "favorites" }),
  );
  app.put("/api/favorites/:id", async (req) => {
    const id = uuid.parse(req.params.id);
    await accessibleVideo(id, req.user);
    await query(
      "INSERT INTO favorites(user_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [req.user.id, id],
    );
    return { ok: true };
  });
  app.delete("/api/favorites/:id", async (req) => {
    await query("DELETE FROM favorites WHERE user_id=$1 AND video_id=$2", [
      req.user.id,
      uuid.parse(req.params.id),
    ]);
    return { ok: true };
  });
  app.post("/api/history", async (req) => {
    const data = z
      .object({
        videoId: uuid,
        position: z.number().finite().min(0),
        ended: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    const video = await accessibleVideo(data.videoId, req.user);
    if (video.status !== "ready") fail(409, "Vídeo ainda não está pronto.");
    if (video.source_type === "external") fail(409, "O player externo não oferece sincronização de progresso.");
    const position = Math.min(data.position, video.duration),
      completed = position >= video.duration * 0.95 && video.duration > 0;
    await query(
      "INSERT INTO watch_history(user_id,video_id,position,completed) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,video_id) DO UPDATE SET position=$3,completed=$4,updated_at=now()",
      [req.user.id, data.videoId, position, completed],
    );
    return { ok: true, position, completed };
  });
  app.post("/api/videos/:id/view", async (req) => {
    const id = uuid.parse(req.params.id);
    await accessibleVideo(id, req.user);
    await transaction(async (db) => {
      const result = await db.query(
        "INSERT INTO video_views(user_id,video_id) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING video_id",
        [req.user.id, id],
      );
      if (result.rowCount)
        await db.query("UPDATE videos SET views=views+1 WHERE id=$1", [id]);
    });
    return { ok: true };
  });
}
