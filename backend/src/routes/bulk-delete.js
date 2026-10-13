import { z } from "zod";
import { admin, fail, uuid } from "../security.js";
import { transaction } from "../db.js";

// A mesma limpeza feita nas exclusões individuais, mas com uma única transação.
// Tudo é validado antes de remover qualquer cadastro.
const payload = z.object({
  contentType: z.enum(["movie", "series"]),
  ids: z.array(uuid).min(1).max(100).refine(
    (items) => new Set(items).size === items.length,
    { message: "Não repita IDs na seleção." },
  ),
}).strict();

export default async function bulkDeleteRoutes(app) {
  app.post("/api/admin/bulk-delete", {
    preHandler: admin,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req) => {
    const { contentType, ids } = payload.parse(req.body);
    // Ordem estável evita deadlocks quando administradores excluem lotes simultaneamente.
    const ordered = [...ids].sort();
    return transaction(async (db) => {
      const { rows: videos } = await db.query(
        "SELECT id,content_type,status FROM videos WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [ordered],
      );
      if (videos.length !== ordered.length)
        fail(409, "A seleção mudou: um ou mais itens não existem. Atualize a lista.");
      if (videos.some((video) => video.content_type !== contentType))
        fail(409, "A seleção contém itens de outro tipo. Atualize a página.");
      if (videos.some((video) => video.status === "processing"))
        fail(409, "Há itens sendo processados. Aguarde o processamento terminar e tente novamente.");

      if (contentType === "movie") {
        await db.query(
          "INSERT INTO media_gc(id,storage_driver) SELECT id,storage_driver FROM videos WHERE id=ANY($1::uuid[]) ON CONFLICT DO NOTHING",
          [ordered],
        );
        await db.query("DELETE FROM videos WHERE id=ANY($1::uuid[])", [ordered]);
        return { ok: true, deleted: ordered.length, seasonsDeleted: 0, episodesDeleted: 0 };
      }

      // Séries: travar pais, depois temporadas e episódios, como na exclusão individual.
      // Não mexer em nenhuma série se algum episódio ainda estiver em processamento.
      const { rows: seasons } = await db.query(
        "SELECT id FROM seasons WHERE series_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [ordered],
      );
      const seasonIds = seasons.map((season) => season.id);
      const { rows: episodes } = await db.query(
        "SELECT id,status FROM videos WHERE season_id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",
        [seasonIds],
      );
      if (episodes.some((episode) => episode.status === "processing"))
        fail(409, "Há episódios em processamento. Aguarde e tente excluir novamente.");

      const allVideoIds = [...ordered, ...episodes.map((episode) => episode.id)];
      await db.query(
        "INSERT INTO media_gc(id,storage_driver) SELECT id,storage_driver FROM videos WHERE id=ANY($1::uuid[]) ON CONFLICT DO NOTHING",
        [allVideoIds],
      );
      await db.query("DELETE FROM videos WHERE season_id=ANY($1::uuid[])", [seasonIds]);
      await db.query("DELETE FROM seasons WHERE series_id=ANY($1::uuid[])", [ordered]);
      await db.query("DELETE FROM videos WHERE id=ANY($1::uuid[])", [ordered]);
      return {
        ok: true,
        deleted: ordered.length,
        seasonsDeleted: seasons.length,
        episodesDeleted: episodes.length,
      };
    });
  });
}
