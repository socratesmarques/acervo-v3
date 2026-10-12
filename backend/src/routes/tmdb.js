import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { admin, uuid, fail } from '../security.js';
import { config } from '../config.js';
import { query, transaction } from '../db.js';
import { putFile } from '../storage.js';
import { normalizeMovieTitle, tmdbPosterUrl, mapMovie } from '../tmdb-client.js';

const searchInput = z.object({
  title: z.string().trim().min(1).max(160),
  year: z.coerce.number().int().min(1888).max(2100).optional()
}).strict();
const pageInput = z.object({
  limit: z.coerce.number().int().min(1).max(30).default(12),
  offset: z.coerce.number().int().min(0).max(1000000).default(0)
}).strict();
const applyInput = z.object({ videoId: uuid, tmdbId: z.number().int().min(1).max(2147483647) }).strict();
function token() {
  if (!config.TMDB_READ_ACCESS_TOKEN) fail(503, 'Configure TMDB_READ_ACCESS_TOKEN no servidor do ACERVO.');
  return config.TMDB_READ_ACCESS_TOKEN;
}
async function tmdbGet(endpoint, params = {}) {
  const url = new URL('/3/' + endpoint, 'https://api.themoviedb.org');
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token(), Accept: 'application/json' },
      signal: AbortSignal.timeout(10000), redirect: 'error'
    });
  } catch { fail(503, 'Consulta ao TMDB indisponível. Tente novamente.'); }
  if (response.status === 429) fail(503, 'TMDB limitou as consultas. Aguarde alguns minutos.');
  if (response.status === 401) fail(503, 'Token TMDB inválido no servidor.');
  if (!response.ok) fail(502, 'TMDB retornou um erro.');
  try { return await response.json(); } catch { fail(502, 'Resposta inválida do TMDB.'); }
}
async function posterBytes(filePath) {
  const url = tmdbPosterUrl(filePath);
  if (!url) fail(422, 'Caminho da capa inválido.');
  let response;
  try { response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(12000) }); }
  catch { fail(503, 'Falha ao buscar a capa no TMDB.'); }
  if (!response.ok || !/^image\/(?:jpeg|png|webp)\b/i.test(response.headers.get('content-type') || ''))
    fail(502, 'TMDB não retornou uma imagem válida.');
  const max = 8 * 1024 * 1024;
  if (Number(response.headers.get('content-length') || 0) > max || !response.body)
    fail(413, 'Capa excede o limite de 8 MB.');
  const reader = response.body.getReader(), parts = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) { await reader.cancel().catch(() => {}); fail(413, 'Capa excede 8 MB.'); }
      parts.push(Buffer.from(value));
    }
  } catch (err) { if (err?.statusCode) throw err; fail(502, 'Erro durante download da capa.'); }
  return Buffer.concat(parts);
}
export default async function tmdbRoutes(app) {
  app.get('/api/admin/tmdb/status', { preHandler: admin }, async () => ({
    configured: Boolean(config.TMDB_READ_ACCESS_TOKEN)
  }));
  app.get('/api/admin/tmdb/missing-posters', { preHandler: admin }, async (req) => {
    const { limit, offset } = pageInput.parse(req.query);
    const where = "content_type='movie' AND status='ready' AND custom_thumbnail=false";
    const [count, list] = await Promise.all([
      query('SELECT count(*)::int AS total FROM videos WHERE ' + where),
      query('SELECT id,title,release_year AS "releaseYear" FROM videos WHERE ' + where +
        ' ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2', [limit, offset])
    ]);
    return { total: count.rows[0].total, items: list.rows, limit, offset };
  });
  app.get('/api/admin/tmdb/search', { preHandler: admin,
    config: { rateLimit: { max: 50, timeWindow: '1 minute' } } }, async (req) => {
    const { title, year } = searchInput.parse(req.query);
    const queryText = normalizeMovieTitle(title);
    if (queryText.length < 2) fail(400, 'Informe ao menos dois caracteres no título.');
    const params = { query: queryText, year, include_adult: false, language: 'pt-BR', page: 1 };
    let response = await tmdbGet('search/movie', params);
    let fallbackWithoutYear = false;
    if (year && !response.results?.some(movie => tmdbPosterUrl(movie.poster_path))) {
      response = await tmdbGet('search/movie', { ...params, year: undefined });
      fallbackWithoutYear = true;
    }
    return { query: queryText, year: year || null, fallbackWithoutYear,
      results: (Array.isArray(response.results) ? response.results : []).map(mapMovie).filter(Boolean).slice(0, 8) };
  });
  app.post('/api/admin/tmdb/apply-poster', { preHandler: admin,
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { videoId, tmdbId } = applyInput.parse(req.body);
    const { rows: [video] } = await query(
      "SELECT id,status,content_type,custom_thumbnail FROM videos WHERE id=$1", [videoId]);
    if (!video || video.status !== 'ready' || video.content_type !== 'movie') fail(404, 'Filme não encontrado.');
    if (video.custom_thumbnail) fail(409, 'Filme já possui uma capa. Nenhuma imagem foi substituída.');
    const movie = await tmdbGet('movie/' + tmdbId, { language: 'pt-BR' });
    if (movie?.id !== tmdbId || !tmdbPosterUrl(movie.poster_path))
      fail(422, 'O filme selecionado não possui pôster no TMDB.');
    const image = await posterBytes(movie.poster_path);
    const directory = path.join(config.STORAGE_DIR, 'temp');
    await mkdir(directory, { recursive: true });
    const temp = path.join(directory, randomUUID() + '.jpg');
    try {
      try {
        const poster = sharp(image, { limitInputPixels: 20000000 });
        const info = await poster.metadata();
        if (!['jpeg','png','webp'].includes(info.format)) fail(422, 'Formato de imagem não permitido.');
        await poster.rotate().resize(500, 750, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(temp);
      } catch (error) { if (error?.statusCode) throw error; fail(422, 'Não foi possível converter a capa.'); }
      const year = Number(String(movie.release_date || '').slice(0, 4));
      const releaseYear = year >= 1888 && year <= 2100 ? year : null;
      await transaction(async (db) => {
        const { rows: [record] } = await db.query(
          'SELECT id,storage_driver,status,content_type,custom_thumbnail FROM videos WHERE id=$1 FOR UPDATE', [videoId]);
        if (!record || record.status !== 'ready' || record.content_type !== 'movie') fail(404, 'Filme não encontrado.');
        if (record.custom_thumbnail) fail(409, 'Outro usuário já adicionou uma capa.');
        await putFile(record.storage_driver, videoId + '/thumbnail.jpg', temp);
        await db.query('UPDATE videos SET custom_thumbnail=true,poster_vertical=true,release_year=COALESCE(release_year,$2),updated_at=now() WHERE id=$1',
          [videoId, releaseYear]);
      });
      return { ok: true, videoId, tmdbId };
    } finally { await rm(temp, { force: true }); }
  });
}
