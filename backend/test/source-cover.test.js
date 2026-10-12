import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import { PGlite } from '@electric-sql/pglite';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/acervo_cover_test';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), 'acervo-covers-'));

const db = new PGlite();
await db.waitReady;
const { pool } = await import('../src/db.js');
const execute = async (sql, values = []) => {
  if (!values.length && sql.includes(';')) {
    const rows = await db.exec(sql);
    return { ...rows.at(-1), rowCount: rows.at(-1)?.affectedRows || 0 };
  }
  const row = await db.query(sql, values);
  return { ...row, rowCount: row.affectedRows ?? row.rows.length };
};
pool.query = execute;
pool.connect = async () => ({ query: execute, release() {} });
const { migrate } = await import('../src/migrate.js');
await migrate();
const { createUser } = await import('../src/security.js');
const admin = await createUser({
  name: 'Administrador', email: 'adm-' + randomUUID() + '@example.org',
  password: 'Senha-segura-12345', role: 'admin'
});
const viewer = await createUser({
  name: 'Visitante', email: 'viewer-' + randomUUID() + '@example.org',
  password: 'Senha-segura-12345', role: 'viewer'
});
const { buildApp } = await import('../src/app.js');
const app = await buildApp({ logger: false });
after(async () => {
  await app.close();
  await pool.end();
  await db.close();
  await rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});
async function session(user) {
  const response = await app.inject({
    method: 'POST', url: '/api/auth/login',
    headers: { origin: process.env.APP_ORIGIN },
    payload: { email: user.email, password: 'Senha-segura-12345' }
  });
  assert.equal(response.statusCode, 200, response.body);
  return { cookie: 'acervo_session=' + response.cookies[0].value, csrf: response.json().csrf };
}
async function upload(videoId, bytes, user, onlyIfMissing = true) {
  const form = new FormData();
  form.append('thumbnail', new Blob([bytes], { type: 'image/jpeg' }), 'cartaz.jpg');
  const request = new Request('http://localhost/upload', { method: 'POST', body: form });
  return app.inject({
    method: 'POST', url: '/api/videos/' + videoId + '/thumbnail' + (onlyIfMissing ? '?ifMissing=1' : ''),
    headers: {
      origin: process.env.APP_ORIGIN, cookie: user.cookie, 'x-csrf-token': user.csrf,
      'content-type': request.headers.get('content-type')
    },
    payload: Buffer.from(await request.arrayBuffer())
  });
}

test('capas automáticas usam 2:3, respeitam permissões e não sobrescrevem capa', async () => {
  const adminSession = await session(admin), viewerSession = await session(viewer);
  const categoryId = randomUUID(), videoId = randomUUID();
  await execute('INSERT INTO categories(id,name) VALUES($1,$2)', [categoryId, 'Filmes']);
  await execute("INSERT INTO videos(id,title,category_id,storage_driver,content_type,source_type,status,published) VALUES($1,'Filme com poster',$2,'local','movie','upload','ready',false)", [videoId, categoryId]);
  const portrait = await sharp({ create: { width: 300, height: 450, channels: 3, background: '#aa2200' } }).jpeg().toBuffer();
  const landscape = await sharp({ create: { width: 400, height: 225, channels: 3, background: '#2288aa' } }).jpeg().toBuffer();

  const forbidden = await upload(videoId, portrait, viewerSession);
  assert.equal(forbidden.statusCode, 403, forbidden.body);

  const first = await upload(videoId, portrait, adminSession);
  assert.equal(first.statusCode, 200, first.body);
  const row = (await execute('SELECT custom_thumbnail,poster_vertical FROM videos WHERE id=$1', [videoId])).rows[0];
  assert.equal(row.custom_thumbnail, true);
  assert.equal(row.poster_vertical, true);
  const file = path.join(process.env.STORAGE_DIR, 'media', videoId, 'thumbnail.jpg');
  const original = await readFile(file);
  assert.equal((await sharp(original).metadata()).height > (await sharp(original).metadata()).width, true);

  const retry = await upload(videoId, landscape, adminSession);
  assert.equal(retry.statusCode, 409, retry.body);
  assert.deepEqual(await readFile(file), original);
  const manual = await upload(videoId, landscape, adminSession, false);
  assert.equal(manual.statusCode, 200, manual.body);
  assert.equal((await execute('SELECT poster_vertical FROM videos WHERE id=$1', [videoId])).rows[0].poster_vertical, false);
});
