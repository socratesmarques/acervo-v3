import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { admin, uuid } from '../security.js';
import { config } from '../config.js';
import { transaction } from '../db.js';
import { externalUrl, resolveExternal } from '../external.js';

const input = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10000).default(''),
  categoryId: uuid,
  contentType: z.enum(['movie', 'series']),
  externalUrl,
}).strict();
// Ordem dos parâmetros e domínio antigo/atual não devem gerar outro cadastro.
export function playerIdentity(path) {
  const url = new URL(path, 'https://identity.example');
  url.searchParams.sort();
  return url.pathname + url.search;
}
export default async function importRoutes(app) {
  app.post('/api/admin/imports', { preHandler: admin, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const data = input.parse(req.body);
    const reference = await resolveExternal(data.externalUrl);
    const identity = playerIdentity(reference.externalPath);
    const result = await transaction(async db => {
      // Serializa importações concorrentes do mesmo provedor (sem criar tabelas novas).
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['acervo-import:' + reference.providerId]);
      const existing = await db.query("SELECT id,external_path FROM videos WHERE source_type='external' AND provider_id=$1", [reference.providerId]);
      const duplicate = existing.rows.find(row => playerIdentity(row.external_path) === identity);
      if (duplicate) return { id: duplicate.id, duplicate: true };
      const id = randomUUID();
      await db.query("INSERT INTO videos(id,title,description,category_id,owner_id,storage_driver,source_type,provider_id,external_path,content_type,status,published) VALUES($1,$2,$3,$4,$5,$6,'external',$7,$8,$9,'ready',false)",
        [id, data.title, data.description, data.categoryId, req.user.id, config.STORAGE_DRIVER, reference.providerId, reference.externalPath, data.contentType]);
      return { id, duplicate: false };
    });
    return reply.code(result.duplicate ? 200 : 201).send(result);
  });
}
