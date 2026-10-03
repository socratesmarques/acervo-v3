import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/acervo_series_test";
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "acervo-series-"));
process.env.STORAGE_DRIVER = "local";
const { PGlite } = await import("@electric-sql/pglite");
const db = new PGlite();
await db.waitReady;
const { pool } = await import("../src/db.js");
const execute = async (sql, values) => {
  if (!values?.length && sql.includes(";")) {
    const results = await db.exec(sql);
    return { ...results.at(-1), rowCount: results.at(-1)?.affectedRows || 0 };
  }
  const result = await db.query(sql, values);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = execute;
pool.connect = async () => ({ query: execute, release() {}, on() {} });
const dir = new URL("../migrations/", import.meta.url);
for (const f of (await readdir(dir)).sort().filter((f) => f.endsWith('.sql') && !f.startsWith('005')))
  await db.exec(await readFile(new URL(f, dir), 'utf8'));
const categoryId = randomUUID(), legacyId = randomUUID();
await db.query("INSERT INTO categories(id,name) VALUES($1,'Séries de teste')", [categoryId]);
await db.query("INSERT INTO videos(id,title,category_id,storage_driver,content_type,source_type,provider_id,external_path,status,published) VALUES($1,'Série antiga',$2,'local','series','external','youtube','/embed/old','ready',true)", [legacyId, categoryId]);
await db.exec(await readFile(new URL('005_series_episodes.sql', dir), 'utf8'));
const { createUser } = await import("../src/security.js");
const { buildApp } = await import("../src/app.js");
const { processOne } = await import("../src/worker.js");
const app = await buildApp({ logger: false });
async function session(role) {
  const user = await createUser({ name: role, email: `${role}@series.test`, password: "Teste-seguro-1234", role });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: process.env.APP_ORIGIN }, payload: { email: user.email, password: 'Teste-seguro-1234' } });
  assert.equal(r.statusCode, 200, r.body);
  return { id: user.id, cookie: `acervo_session=${r.cookies[0].value}`, csrf: r.json().csrf };
}
const admin = await session('admin'), viewer = await session('viewer');
const request = (method, url, payload, user = admin, extra = {}) => app.inject({ method, url, payload, headers: {
  origin: process.env.APP_ORIGIN, ...(user ? { cookie: user.cookie, 'x-csrf-token': user.csrf } : {}), ...extra,
} });
async function create(fields, file) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ title: 'Teste', categoryId, published: 'true', ...fields })) form.set(key, value);
  if (file) form.set('video', new Blob([file], { type: 'video/mp4' }), 'episode.mp4');
  const req = new Request('http://localhost', { method: 'POST', body: form });
  return request('POST', '/api/videos', Buffer.from(await req.arrayBuffer()), admin, { 'content-type': req.headers.get('content-type') });
}
let series, s1, s2, ep1, ep2, uploaded;
after(async () => { await app.close(); await pool.end(); await db.close(); await rm(process.env.STORAGE_DIR, { force: true, recursive: true }); });

test('séries: migration, organização, episódios e acesso', async (t) => {
  await t.test('migration preserva a série e o link antigo', async () => {
    const r = await request('GET', `/api/videos/${legacyId}`, undefined, viewer);
    assert.equal(r.statusCode, 200); assert.equal(r.json().externalUrl, 'https://www.youtube.com/embed/old');
  });
  await t.test('criação de série sem arquivo e validação da origem', async () => {
    assert.equal((await create({ contentType: 'movie', sourceType: 'collection' })).statusCode, 400);
    const r = await create({ title: 'Horizontes', contentType: 'series', sourceType: 'collection' });
    assert.equal(r.statusCode, 201, r.body); series = r.json().id;
    const video = (await request('GET', `/api/videos/${series}`, undefined, viewer)).json();
    assert.equal(video.source, null); assert.equal(video.mp4Url, null); assert.equal(video.thumbnail, '/placeholder-video.svg');
    assert.equal((await request('POST', '/api/history', { videoId: series, position: 2 }, viewer)).statusCode, 409);
  });
  await t.test('temporadas exigem admin/CSRF e numeração única', async () => {
    const url = `/api/series/${series}/seasons`, body = { number: 2, title: 'Segunda' };
    assert.equal((await request('POST', url, body, null)).statusCode, 401);
    assert.equal((await request('POST', url, body, viewer)).statusCode, 403);
    assert.equal((await request('POST', url, body, admin, { 'x-csrf-token': 'wrong' })).statusCode, 403);
    assert.equal((await request('POST', url, { number: 0 })).statusCode, 400);
    let r = await request('POST', url, body); assert.equal(r.statusCode, 201, r.body); s2 = r.json().id;
    assert.equal((await request('POST', url, body)).statusCode, 409);
    r = await request('POST', url, { number: 1 }); s1 = r.json().id;
    assert.equal((await request('PUT', `/api/seasons/${s1}`, { number: 1, title: 'Começo' })).statusCode, 200);
    assert.deepEqual((await request('GET', url)).json().items.map((s) => s.number), [1, 2]);
    assert.deepEqual((await request('GET', url, undefined, viewer)).json().items, []);
  });
  await t.test('episódios externos: numeração, catálogo e rascunhos', async () => {
    const fields = { contentType: 'episode', sourceType: 'external', externalUrl: 'https://redecanais.af/player3/server.php?vid=EP1' };
    assert.equal((await create(fields)).statusCode, 400);
    assert.equal((await create({ ...fields, seasonId: s1, episodeNumber: 0 })).statusCode, 400);
    let r = await create({ ...fields, seasonId: s1, episodeNumber: 1, title: 'Partida' });
    assert.equal(r.statusCode, 201, r.body); ep1 = r.json().id;
    assert.equal((await create({ ...fields, seasonId: s1, episodeNumber: 1 })).statusCode, 409);
    r = await create({ ...fields, externalUrl: 'https://www.youtube.com/embed/ep2', seasonId: s2, episodeNumber: 1, published: 'false' });
    assert.equal(r.statusCode, 201, r.body); ep2 = r.json().id;
    const ep = (await request('GET', `/api/videos/${ep1}`)).json();
    assert.equal(ep.seriesId, series); assert.equal(ep.seriesTitle, 'Horizontes'); assert.equal(ep.seasonNumber, 1); assert.equal(ep.episodeNumber, 1);
    assert.match(ep.externalUrl, /^https:\/\/redecanais.press\//);
    assert.equal((await request('GET', ep.playerUrl, undefined, viewer)).statusCode, 200);
    assert.equal((await request('POST', `/api/series/${ep1}/seasons`, { number: 1 })).statusCode, 409);
    const seasons = (await request('GET', `/api/series/${series}/seasons`, undefined, viewer)).json().items;
    assert.equal(seasons.length, 1); assert.equal(seasons[0].episodes[0].id, ep1);
    assert.equal((await request('GET', `/api/videos/${ep2}`, undefined, viewer)).statusCode, 404);
    const catalog = (await request('GET', '/api/videos', undefined, viewer)).json().items;
    assert(catalog.some((v) => v.id === series)); assert(!catalog.some((v) => v.id === ep1));
  });
  await t.test('upload HLS mantém histórico individual por episódio', async () => {
    const r = await create({ title: 'Viagem', contentType: 'episode', sourceType: 'upload', seasonId: s1, episodeNumber: 2 }, await readFile(new URL('./fixtures/flower.mp4', import.meta.url)));
    assert.equal(r.statusCode, 202, r.body); uploaded = r.json().id;
    const client = await pool.connect(); assert.equal(await processOne(client), true);
    const episode = (await request('GET', `/api/videos/${uploaded}`, undefined, viewer)).json();
    assert.equal(episode.status, 'ready'); assert(episode.source);
    assert.equal((await request('POST', '/api/history', { videoId: uploaded, position: 2 }, viewer)).statusCode, 200);
    const history = (await request('GET', '/api/history?contentType=series', undefined, viewer)).json().items;
    assert.equal(history[0].id, uploaded); assert.equal(history[0].seriesId, series);
    assert.equal((await request('POST', '/api/history', { videoId: ep1, position: 2 }, viewer)).statusCode, 409);
  });
  await t.test('despublicar série revoga episódios, player, mídia e histórico', async () => {
    await request('PUT', `/api/favorites/${uploaded}`, undefined, viewer);
    const meta = { title: 'Horizontes', categoryId, published: false };
    assert.equal((await request('PUT', `/api/videos/${series}`, meta)).statusCode, 200);
    for (const url of [`/api/videos/${ep1}`, `/api/players/${ep1}`, `/api/media/${uploaded}/master.m3u8`, `/api/series/${series}/seasons`])
      assert.equal((await request('GET', url, undefined, viewer)).statusCode, 404, url);
    for (const url of ['/api/history', '/api/favorites']) assert.equal((await request('GET', url, undefined, viewer)).json().total, 0);
    assert.equal((await request('GET', `/api/videos/${ep1}`)).statusCode, 200);
    await request('PUT', `/api/videos/${series}`, { ...meta, published: true });
    assert.equal((await request('GET', '/api/history', undefined, viewer)).json().total, 1);
  });
  await t.test('move episódio sem perder histórico e impede conflitos', async () => {
    assert.equal((await request('PUT', `/api/episodes/${uploaded}`, { seasonId: s2, episodeNumber: 1 })).statusCode, 409);
    const r = await request('PUT', `/api/episodes/${uploaded}`, { seasonId: s2, episodeNumber: 2 });
    assert.equal(r.statusCode, 200, r.body); assert.equal(r.json().seasonNumber, 2); assert.equal(r.json().episodeNumber, 2);
    assert.equal((await request('GET', '/api/history', undefined, viewer)).json().items[0].position, 2);
    assert.equal((await request('PUT', `/api/episodes/${series}`, { seasonId: s1, episodeNumber: 9 })).statusCode, 409);
    assert.equal((await request('PUT', `/api/episodes/${ep1}`, { seasonId: s2, episodeNumber: 9 }, viewer)).statusCode, 403);
    assert.equal((await request('PUT', `/api/episodes/${ep1}`, { seasonId: randomUUID(), episodeNumber: 9 })).statusCode, 404);
  });
  await t.test('vincula vídeo importado preservando URL e publicação', async () => {
    const created = await request('POST', '/api/admin/imports', { title: 'Já importado', categoryId, contentType: 'movie', externalUrl: 'https://www.youtube.com/embed/imported' });
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().id;
    const linked = await request('PUT', `/api/episodes/${id}`, { seasonId: s1, episodeNumber: 5 });
    assert.equal(linked.statusCode, 200, linked.body); assert.equal(linked.json().published, false); assert.equal(linked.json().externalUrl, 'https://www.youtube.com/embed/imported');
    await request('DELETE', `/api/videos/${id}`);
  });
  await t.test('envio rápido: destinos, publicação, numeração, duplicados e permissões', async () => {
    const options = await request('GET', '/api/admin/import-options');
    assert.equal(options.statusCode, 200, options.body);
    assert.equal(options.json().userId, admin.id);
    assert(options.json().series.some((s) => s.id === series));
    assert.equal(options.json().seasons.find((s) => s.id === s2).nextEpisodeNumber, 3);
    assert.equal((await request('GET', '/api/admin/import-options', undefined, viewer)).statusCode, 403);
    assert.equal((await request('GET', '/api/admin/import-options', undefined, null)).statusCode, 401);
    const data = { title: 'Envio rápido', externalUrl: 'https://redecanais.af/player3/server.php?vid=QUICK&server=A', contentType: 'episode', seasonId: s2, published: true };
    for (const user of [null, viewer]) assert.equal((await request('POST', '/api/admin/quick-imports', data, user)).statusCode, user ? 403 : 401);
    assert.equal((await request('POST', '/api/admin/quick-imports', data, admin, { 'x-csrf-token': 'wrong' })).statusCode, 403);
    assert.equal((await request('POST', '/api/admin/quick-imports', data, admin, { origin: 'https://evil.example' })).statusCode, 403);
    for (const override of [{ contentType: 'series' }, { categoryId }, { seasonId: undefined }, { episodeNumber: 0 }, { episodeNumber: 1.5 }, { title: '' }, { published: 'true' }, { externalUrl: 'javascript:alert(1)' }])
      assert.equal((await request('POST', '/api/admin/quick-imports', { ...data, ...override })).statusCode, 400);
    assert.equal((await request('POST', '/api/admin/quick-imports', { ...data, seasonId: randomUUID() })).statusCode, 404);
    const created = await request('POST', '/api/admin/quick-imports', data);
    assert.equal(created.statusCode, 201, created.body); assert.equal(created.json().episodeNumber, 3); assert.equal(created.json().nextEpisodeNumber, 4);
    const id = created.json().id;
    const record = (await request('GET', `/api/videos/${id}`, undefined, viewer)).json();
    assert.equal(record.categoryId, categoryId); assert.equal(record.published, true); assert.equal(record.seasonId, s2);
    const duplicate = await request('POST', '/api/admin/quick-imports', { ...data, title: 'Não sobrescrever', seasonId: s1, published: false, externalUrl: 'https://redecanais.press/player3/server.php?server=A&vid=QUICK' });
    assert.equal(duplicate.statusCode, 200, duplicate.body); assert.equal(duplicate.json().duplicate, true); assert.equal(duplicate.json().id, id); assert.equal(duplicate.json().seasonId, s2);
    assert.equal((await request('GET', `/api/videos/${id}`)).json().title, 'Envio rápido');
    assert.equal((await request('POST', '/api/admin/quick-imports', { ...data, externalUrl: 'https://www.youtube.com/embed/conflict', episodeNumber: 3 })).statusCode, 409);
    const manual = await request('POST', '/api/admin/quick-imports', { ...data, externalUrl: 'https://www.youtube.com/embed/manual', episodeNumber: 8, published: false });
    assert.equal(manual.statusCode, 201, manual.body); assert.equal(manual.json().episodeNumber, 8); assert.equal(manual.json().nextEpisodeNumber, 9);
    assert.equal((await request('GET', `/api/videos/${manual.json().id}`, undefined, viewer)).statusCode, 404);
    const otherCategory = (await request('POST', '/api/categories', { name: 'Outra categoria rápida' })).json().id;
    const movie = await request('POST', '/api/admin/quick-imports', { title: 'Filme rápido', externalUrl: 'https://www.youtube.com/embed/quickmovie', contentType: 'movie', categoryId: otherCategory });
    assert.equal(movie.statusCode, 201, movie.body); assert.equal(movie.json().published, false);
    assert.equal((await request('GET', `/api/videos/${movie.json().id}`)).json().categoryId, otherCategory);
    assert.equal((await request('POST', '/api/admin/quick-imports', { title: 'Inválido', externalUrl: 'https://www.youtube.com/embed/a', contentType: 'movie', categoryId: randomUUID() })).statusCode, 404);
    for (const videoId of [id, manual.json().id, movie.json().id]) await request('DELETE', `/api/videos/${videoId}`);
    await request('DELETE', `/api/categories/${otherCategory}`);
  });
  await t.test('aba séries: criação sem mídia, temporada inicial, edição, busca e autorização', async () => {
    const data = { title: 'Série independente', description: 'Sem vídeo avulso', categoryId, published: true };
    assert.equal((await request('GET', '/api/admin/series', undefined, viewer)).statusCode, 403);
    assert.equal((await request('POST', '/api/series', data, viewer)).statusCode, 403);
    assert.equal((await request('POST', '/api/series', data, null)).statusCode, 401);
    assert.equal((await request('POST', '/api/series', data, admin, { 'x-csrf-token': 'wrong' })).statusCode, 403);
    for (const override of [{ title: '' }, { sourceType: 'external' }, { externalUrl: 'https://www.youtube.com/embed/a' }, { video: 'file.mp4' }, { firstSeason: 'true' }])
      assert.equal((await request('POST', '/api/series', { ...data, ...override })).statusCode, 400);
    assert.equal((await request('POST', '/api/series', { ...data, categoryId: randomUUID() })).statusCode, 409);
    const created = await request('POST', '/api/series', data);
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().id;
    assert.equal(created.json().sourceType, 'collection'); assert.equal(created.json().source, null); assert.equal(created.json().externalUrl, null);
    let seasons = (await request('GET', `/api/series/${id}/seasons`)).json().items;
    assert.equal(seasons.length, 1); assert.equal(seasons[0].number, 1); assert.equal(seasons[0].episodes.length, 0);
    const list = await request('GET', '/api/admin/series?q=independente&limit=1');
    assert.equal(list.json().total, 1); assert.equal(list.json().items[0].seasonCount, 1); assert.equal(list.json().items[0].episodeCount, 0);
    assert.equal((await request('GET', '/api/admin/series?q=independente&offset=1')).json().items.length, 0);
    assert.equal((await request('GET', '/api/admin/videos?contentType=movie')).json().items.some((v) => v.id === id), false);
    assert.equal((await request('PUT', `/api/series/${id}`, { ...data, title: 'Renomeada', published: false })).statusCode, 200);
    assert.equal((await request('GET', `/api/videos/${id}`, undefined, viewer)).statusCode, 404);
    assert.equal((await request('PUT', `/api/series/${ep1}`, data)).statusCode, 404);
    await request('DELETE', `/api/seasons/${seasons[0].id}`);
    await request('DELETE', `/api/videos/${id}`);
    const empty = await request('POST', '/api/series', { ...data, firstSeason: false });
    assert.equal(empty.statusCode, 201, empty.body);
    seasons = (await request('GET', `/api/series/${empty.json().id}/seasons`)).json().items;
    assert.equal(seasons.length, 0);
    await request('DELETE', `/api/videos/${empty.json().id}`);
  });
  await t.test('exclusão exige remover episódios e temporadas explicitamente', async () => {
    assert.equal((await request('DELETE', `/api/videos/${series}`)).statusCode, 409);
    assert.equal((await request('DELETE', `/api/seasons/${s1}`)).statusCode, 409);
    assert.equal((await request('PUT', `/api/videos/${series}`, { title: 'Horizontes', categoryId, published: true, contentType: 'movie' })).statusCode, 409);
    const temp = (await request('POST', `/api/series/${legacyId}/seasons`, { number: 1 })).json();
    assert.equal((await request('PUT', `/api/videos/${legacyId}`, { title: 'Antiga', categoryId, contentType: 'movie' })).statusCode, 409);
    await request('DELETE', `/api/seasons/${temp.id}`);
    for (const id of [ep1, ep2, uploaded]) assert.equal((await request('DELETE', `/api/videos/${id}`)).statusCode, 200);
    for (const id of [s1, s2]) assert.equal((await request('DELETE', `/api/seasons/${id}`)).statusCode, 200);
    assert.equal((await request('DELETE', `/api/videos/${series}`)).statusCode, 200);
    assert.equal((await request('GET', '/api/history', undefined, viewer)).json().total, 0);
    assert.equal((await request('GET', '/api/favorites', undefined, viewer)).json().total, 0);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM media_gc WHERE id=$1', [uploaded])).rows[0].n, 1);
  });
});
