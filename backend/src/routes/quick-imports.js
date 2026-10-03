import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { admin, uuid, fail } from '../security.js';
import { config } from '../config.js';
import { query, transaction } from '../db.js';
import { externalUrl, resolveExternal } from '../external.js';
import { playerIdentity } from './imports.js';

const input = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(10000).default(''),
  externalUrl,
  contentType: z.enum(['movie', 'episode']),
  categoryId: uuid.optional(),
  seasonId: uuid.optional(),
  episodeNumber: z.number().int().min(1).max(10000).optional(),
  published: z.boolean().default(false),
}).strict().superRefine((data, ctx) => {
  if (data.contentType === 'movie' && (!data.categoryId || data.seasonId || data.episodeNumber !== undefined))
    ctx.addIssue({ code: 'custom', path: ['categoryId'], message: 'Selecione uma categoria para o filme. Temporada e número são exclusivos de episódios.' });
  if (data.contentType === 'episode' && (!data.seasonId || data.categoryId))
    ctx.addIssue({ code: 'custom', path: ['seasonId'], message: 'Selecione a temporada. A categoria será a mesma da série.' });
});
const nextNumber = async (db, seasonId) => Number((await db.query('SELECT COALESCE(max(episode_number),0)+1 AS number FROM videos WHERE season_id=$1', [seasonId])).rows[0].number);
export default async function quickImportRoutes(app) {
  app.get('/api/admin/import-options', { preHandler: admin }, async (req) => {
    const [categories, series, seasons] = await Promise.all([
      query('SELECT id,name FROM categories ORDER BY name'),
      query("SELECT id,title,category_id AS \"categoryId\",published FROM videos WHERE content_type='series' ORDER BY lower(title),id"),
      query('SELECT s.id,s.series_id AS "seriesId",s.number,s.title,COALESCE(max(v.episode_number),0)+1 AS "nextEpisodeNumber" FROM seasons s LEFT JOIN videos v ON v.season_id=s.id GROUP BY s.id ORDER BY s.number,s.id'),
    ]);
    return { userId: req.user.id, categories: categories.rows, series: series.rows, seasons: seasons.rows };
  });
  app.post('/api/admin/quick-imports', { preHandler: admin, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const data = input.parse(req.body), reference = await resolveExternal(data.externalUrl);
    const result = await transaction(async (db) => {
      // Same lock as the review importer: repeat clicks or popup closure cannot duplicate a player.
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['acervo-import:' + reference.providerId]);
      let categoryId = data.categoryId, number = null, seriesId = null, seriesPublished = null;
      if (data.contentType === 'episode') {
        const { rows: [season] } = await db.query('SELECT s.id,s.series_id,v.category_id,v.published FROM seasons s JOIN videos v ON v.id=s.series_id WHERE s.id=$1 FOR UPDATE OF s', [data.seasonId]);
        if (!season) fail(404, 'A temporada foi excluída. Atualize os destinos na extensão.');
        categoryId = season.category_id; seriesId = season.series_id; seriesPublished = season.published;
      } else if (!(await db.query('SELECT 1 FROM categories WHERE id=$1', [categoryId])).rows.length) {
        fail(404, 'A categoria foi excluída. Atualize os destinos na extensão.');
      }
      const existing = await db.query("SELECT id,title,content_type,published,season_id,episode_number,external_path FROM videos WHERE source_type='external' AND provider_id=$1", [reference.providerId]);
      const duplicate = existing.rows.find((row) => playerIdentity(row.external_path) === playerIdentity(reference.externalPath));
      if (duplicate) return { id: duplicate.id, title: duplicate.title, duplicate: true, contentType: duplicate.content_type,
        published: duplicate.published, seasonId: duplicate.season_id, episodeNumber: duplicate.episode_number,
        nextEpisodeNumber: data.seasonId ? await nextNumber(db, data.seasonId) : null };
      if (data.seasonId) {
        number = data.episodeNumber ?? await nextNumber(db, data.seasonId);
        if (number > 10000) fail(409, 'O limite de episódios desta temporada foi atingido. Escolha outra temporada.');
      }
      const id = randomUUID();
      await db.query("INSERT INTO videos(id,title,description,category_id,owner_id,storage_driver,source_type,provider_id,external_path,content_type,status,published,published_at,season_id,episode_number) VALUES($1,$2,$3,$4,$5,$6,'external',$7,$8,$9,'ready',$10,CASE WHEN $10 THEN now() ELSE NULL END,$11,$12)",
        [id, data.title, data.description, categoryId, req.user.id, config.STORAGE_DRIVER, reference.providerId, reference.externalPath, data.contentType, data.published, data.seasonId ?? null, number]);
      return { id, title: data.title, duplicate: false, contentType: data.contentType, published: data.published,
        seasonId: data.seasonId ?? null, seriesId, seriesPublished, episodeNumber: number,
        nextEpisodeNumber: data.seasonId ? await nextNumber(db, data.seasonId) : null };
    });
    return reply.code(result.duplicate ? 200 : 201).send(result);
  });
}
