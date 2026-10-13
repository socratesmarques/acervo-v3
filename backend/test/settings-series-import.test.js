import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/acervo_settings_test';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), 'acervo-settings-'));
process.env.STORAGE_DRIVER = 'local';
const { PGlite } = await import('@electric-sql/pglite');
const db = new PGlite();
await db.waitReady;
const { pool } = await import('../src/db.js');
const execute = async (sql, params) => {
  if (!params?.length && sql.includes(';')) {
    const res = await db.exec(sql);
    return { ...res.at(-1), rowCount: res.at(-1)?.affectedRows || 0 };
  }
  const res = await db.query(sql, params);
  return { ...res, rowCount: res.affectedRows ?? res.rows.length };
};
pool.query = execute;
pool.connect = async () => ({ query: execute, release() {}, on() {} });
const { migrate } = await import('../src/migrate.js');
await migrate();
const { createUser } = await import('../src/security.js');
const { buildApp } = await import('../src/app.js');
const app = await buildApp({ logger: false });
after(async () => {
  await app.close(); await pool.end(); await db.close();
  await rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});
async function session(role) {
  const user = await createUser({ name: role, email: role + '@settings.test',
    password: 'Teste-seguro-1234', role });
  const r = await app.inject({ method: 'POST', url: '/api/auth/login',
    headers: { origin: process.env.APP_ORIGIN },
    payload: { email: user.email, password: 'Teste-seguro-1234' } });
  assert.equal(r.statusCode, 200, r.body);
  return { cookie: 'acervo_session=' + r.cookies[0].value, csrf: r.json().csrf };
}
const admin = await session('admin'), viewer = await session('viewer');
const call = (method,url,body,user=admin) => app.inject({
  method, url, headers: { origin: process.env.APP_ORIGIN,
    ...(user ? { cookie: user.cookie, 'x-csrf-token': user.csrf } : {}) },
  ...(body === undefined ? {} : { payload: body }),
});
const categoryId = randomUUID();
await db.query("INSERT INTO categories(id,name) VALUES($1,'Catálogo de teste')", [categoryId]);

test('configuração única do ano exige administrador e preserva metadados', async () => {
  assert.equal((await call('GET','/api/settings',undefined,viewer)).json().showReleaseYear,true);
  assert.equal((await call('GET','/api/settings',undefined,null)).statusCode,401);
  assert.equal((await call('PUT','/api/admin/settings',{ showReleaseYear: false },viewer)).statusCode,403);
  assert.equal((await call('PUT','/api/admin/settings',{ showReleaseYear: 'false' })).statusCode,400);
  assert.equal((await call('PUT','/api/admin/settings',{ showReleaseYear:false, extra:true })).statusCode,400);
  assert.equal((await call('PUT','/api/admin/settings',{ showReleaseYear:false })).statusCode,200);
  assert.equal((await call('GET','/api/settings',undefined,viewer)).json().showReleaseYear,false);
  assert.equal((await call('PUT','/api/admin/settings',{ showReleaseYear:true })).statusCode,200);
  assert.equal((await call('GET','/api/settings',undefined,viewer)).json().showReleaseYear,true);
});

test('importação de série é idempotente por URL e aceita temporadas existentes', async () => {
  const body = { sourcePage:'https://series.example/aventura', title:'Aventura',
    categoryId, description:'Série dublada', published:false };
  assert.equal((await call('POST','/api/admin/quick-series',body,viewer)).statusCode,403);
  assert.equal((await call('POST','/api/admin/quick-series',{ ...body, sourcePage:'http://site.example/serie' })).statusCode,400);
  assert.equal((await call('POST','/api/admin/quick-series',{ ...body, sourcePage:'https://user:pass@site.example/serie' })).statusCode,400);
  assert.equal((await call('POST','/api/admin/quick-series',{ ...body, categoryId:randomUUID() })).statusCode,404);
  let created = await call('POST','/api/admin/quick-series',body);
  assert.equal(created.statusCode,201,created.body);
  const id = created.json().id;
  assert.equal(created.json().duplicate,false);
  assert.equal((await call('GET','/api/videos/'+id)).json().episodeCoverDefault,true);
  assert.equal((await call('GET','/api/series/'+id+'/seasons')).json().items.length,0);
  created = await call('POST','/api/admin/quick-series',{ ...body, title:'Não sobrescrever',published:true });
  assert.equal(created.statusCode,200,created.body);
  assert.equal(created.json().duplicate,true);
  assert.equal(created.json().id,id);
  assert.equal(created.json().title,'Aventura');
  assert.equal(created.json().published,false);
  assert.equal((await db.query("SELECT count(*)::int AS total FROM series_import_sources")).rows[0].total,1);
  const first = await call('POST','/api/series/'+id+'/seasons',{number:1,title:''});
  assert.equal(first.statusCode,201,first.body);
  assert.equal((await call('POST','/api/series/'+id+'/seasons',{number:1})).statusCode,409);
  assert.equal((await call('GET','/api/series/'+id+'/seasons')).json().items.length,1);
  await db.query('UPDATE videos SET release_year=2007 WHERE id=$1',[id]);
  await call('PUT','/api/admin/settings',{showReleaseYear:false});
  assert.equal((await call('GET','/api/videos/'+id)).json().releaseYear,2007); // ocultação é apresentação, não perda de dados
  await call('DELETE','/api/series/'+id);
  assert.equal((await db.query("SELECT count(*)::int AS total FROM series_import_sources")).rows[0].total,0);
});
