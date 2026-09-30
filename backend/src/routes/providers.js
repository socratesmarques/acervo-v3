import { z } from "zod";
import { query, transaction } from "../db.js";
import { admin, fail, uuid } from "../security.js";
import { providerOrigin, playbackUrl } from "../external.js";
import { accessibleVideo } from "../catalog.js";
const providerId = z.enum(["youtube", "youtube-private", "vimeo", "redecanais"]);
const changes = z.object({ baseUrl: providerOrigin, version: z.number().int().positive() }).strict();
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"})[ch]);
export default async function providerRoutes(app) {
  app.get("/api/admin/providers", { preHandler: admin }, async () => ({
    items: (await query(`SELECT p.id,p.name,p.kind,p.base_url AS "baseUrl",p.version,
      (SELECT count(*)::int FROM videos WHERE provider_id=p.id) AS "videoCount",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('oldUrl',old_url,'newUrl',new_url,'createdAt',created_at) ORDER BY created_at DESC)
        FROM (SELECT * FROM provider_changes WHERE provider_id=p.id ORDER BY created_at DESC LIMIT 5) recent),'[]') AS changes
      FROM providers p ORDER BY p.name`)).rows,
  }));
  app.put("/api/admin/providers/:id", { preHandler: admin }, async (req) => {
    const id = providerId.parse(req.params.id), data = changes.parse(req.body);
    await transaction(async db => {
      const { rows: [current] } = await db.query("SELECT * FROM providers WHERE id=$1 FOR UPDATE", [id]);
      if (!current) fail(404, "Provedor não encontrado.");
      if (current.version !== data.version) fail(409, "Este provedor foi alterado. Atualize a página antes de salvar.");
      if (current.base_url === data.baseUrl) return;
      await db.query("INSERT INTO provider_origins(origin,provider_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [data.baseUrl,id]);
      const { rows: [owner] } = await db.query("SELECT provider_id FROM provider_origins WHERE origin=$1", [data.baseUrl]);
      if (owner.provider_id !== id) fail(409, "Esse domínio já pertence a outro provedor.");
      await db.query("UPDATE providers SET base_url=$2,version=version+1,updated_at=now() WHERE id=$1", [id,data.baseUrl]);
      await db.query("INSERT INTO provider_changes(provider_id,old_url,new_url,changed_by) VALUES($1,$2,$3,$4)", [id,current.base_url,data.baseUrl,req.user.id]);
    });
    return { ok: true, message: "Domínio atualizado para todos os vídeos vinculados. Reabra o player para usar o novo endereço." };
  });
  // This authenticated same-origin document owns the dynamic frame-src policy.
  // No provider URL is fetched or proxied by the backend.
  app.get("/api/players/:id", async (req, reply) => {
    const video = await accessibleVideo(uuid.parse(req.params.id), req.user);
    if (video.source_type !== "external") fail(404, "Player externo não encontrado.");
    const url = playbackUrl(video);
    reply.header("Content-Security-Policy", `default-src 'none'; style-src 'unsafe-inline'; frame-src ${video.provider_origin}; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; object-src 'none'`);
    reply.header("X-Frame-Options", "SAMEORIGIN");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    const sandbox = video.provider_kind === "redecanais" ? "" : ' sandbox="allow-scripts allow-same-origin allow-presentation"';
    return reply.type("text/html; charset=utf-8").send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(video.title)}</title><style>html,body{margin:0;width:100%;height:100%;background:#090b0d}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe title="${escapeHtml(video.title)}" src="${escapeHtml(url)}" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"${sandbox}></iframe></body></html>`);
  });
}
