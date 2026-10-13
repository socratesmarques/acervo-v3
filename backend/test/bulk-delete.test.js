import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/acervo_bulk_test";
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "acervo-bulk-"));

const { PGlite } = await import("@electric-sql/pglite");
const db = new PGlite();
await db.waitReady;
const { pool } = await import("../src/db.js");
const query = async (sql, args) => {
  if (!args?.length && sql.includes(";")) {
    const results = await db.exec(sql);
    return { ...results.at(-1), rowCount: results.at(-1)?.affectedRows || 0 };
  }
  const result = await db.query(sql, args);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = query;
pool.connect = async () => ({ query, release() {}, on() {} });
const { migrate } = await import("../src/migrate.js");
await migrate();
const { createUser } = await import("../src/security.js");
const { buildApp } = await import("../src/app.js");
const app = await buildApp({ logger: false });
after(async () => {
  await app.close();
  await pool.end();
  await db.close();
  await rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});

async function session(role) {
  const email = role + "@bulk.test", password = "Teste-seguro-1234";
  await createUser({ name: role, email, password, role });
  const response = await app.inject({
    method: "POST", url: "/api/auth/login",
    headers: { origin: process.env.APP_ORIGIN },
    payload: { email, password },
  });
  assert.equal(response.statusCode, 200, response.body);
  return { cookie: "acervo_session=" + response.cookies[0].value, csrf: response.json().csrf };
}
const adminSession = await session("admin"), viewerSession = await session("viewer");
async function request(body, user = adminSession, headers = {}) {
  return app.inject({
    method: "POST", url: "/api/admin/bulk-delete",
    headers: {
      origin: process.env.APP_ORIGIN,
      ...(user ? { cookie: user.cookie, "x-csrf-token": user.csrf } : {}),
      ...headers,
    }, payload: body,
  });
}
const categoryId = randomUUID();
await db.query("INSERT INTO categories(id,name) VALUES($1,'Filmes e séries')", [categoryId]);
async function movie(title, status = "ready") {
  const id = randomUUID();
  await db.query("INSERT INTO videos(id,title,category_id,storage_driver,source_type,content_type,status,published) VALUES($1,$2,$3,'local','upload','movie',$4,true)",
    [id, title, categoryId, status]);
  return id;
}
async function series(title) {
  const id = randomUUID();
  await db.query("INSERT INTO videos(id,title,category_id,storage_driver,source_type,content_type,status,published) VALUES($1,$2,$3,'local','collection','series','ready',true)",
    [id, title, categoryId]);
  return id;
}
async function season(seriesId, number) {
  const id = randomUUID();
  await db.query("INSERT INTO seasons(id,series_id,number) VALUES($1,$2,$3)", [id, seriesId, number]);
  return id;
}
async function episode(seasonId, number, status = "ready") {
  const id = randomUUID();
  await db.query("INSERT INTO videos(id,title,category_id,storage_driver,source_type,content_type,status,season_id,episode_number,published) VALUES($1,$2,$3,'local','upload','episode',$4,$5,$6,true)",
    [id, "Episódio " + number, categoryId, status, seasonId, number]);
  return id;
}
async function exists(table, id) {
  const { rows } = await db.query("SELECT 1 FROM " + table + " WHERE id=$1", [id]);
  return rows.length > 0;
}
async function queued(ids) {
  const { rows: [{ total }] } = await db.query(
    "SELECT count(*)::int AS total FROM media_gc WHERE id=ANY($1::uuid[])", [ids]);
  return total;
}

test("somente administrador pode excluir; seleção e CSRF são validados", async () => {
  const id = await movie("Para proteger");
  assert.equal((await request({ contentType: "movie", ids: [id] }, viewerSession)).statusCode, 403);
  assert.equal((await request({ contentType: "movie", ids: [id] }, null)).statusCode, 401);
  assert.equal((await request({ contentType: "movie", ids: [id] }, adminSession, { "x-csrf-token": "wrong" })).statusCode, 403);
  for (const body of [
    { contentType: "movie", ids: [] },
    { contentType: "movie", ids: [id, id] },
    { contentType: "episode", ids: [id] },
    { contentType: "movie", ids: ["not-a-uuid"] },
    { contentType: "movie", ids: Array.from({ length: 101 }, () => randomUUID()) },
    { contentType: "movie", ids: [id], extra: true },
  ]) assert.equal((await request(body)).statusCode, 400);
  assert.equal(await exists("videos", id), true);
});

test("filmes: exclusão em uma operação e limpeza agendada", async () => {
  const first = await movie("Primeiro"), second = await movie("Segundo");
  const r = await request({ contentType: "movie", ids: [first, second] });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { ok: true, deleted: 2, seasonsDeleted: 0, episodesDeleted: 0 });
  assert.equal(await exists("videos", first), false);
  assert.equal(await exists("videos", second), false);
  assert.equal(await queued([first, second]), 2);
});

test("filmes: erro de processamento, tipo errado ou ID inexistente não exclui ninguém", async () => {
  const first = await movie("Seguro"), processing = await movie("Ainda processando", "processing");
  let r = await request({ contentType: "movie", ids: [first, processing] });
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(await exists("videos", first), true);
  assert.equal(await queued([first]), 0);
  r = await request({ contentType: "movie", ids: [first, randomUUID()] });
  assert.equal(r.statusCode, 409);
  assert.equal(await exists("videos", first), true);
  const wrong = await series("Outro tipo");
  r = await request({ contentType: "movie", ids: [first, wrong] });
  assert.equal(r.statusCode, 409);
  assert.equal(await exists("videos", wrong), true);
  assert.equal(await exists("videos", first), true);
});

test("séries: exclusão reúne temporadas, episódios, favoritos e arquivos", async () => {
  const first = await series("Série 1"), second = await series("Série 2");
  const s1 = await season(first, 1), s2 = await season(first, 2), s3 = await season(second, 1);
  const e1 = await episode(s1, 1), e2 = await episode(s2, 1), e3 = await episode(s3, 1);
  await db.query("INSERT INTO series_import_sources(source_url,series_id) VALUES($1,$2)",
    ["https://series.example/test-1", first]);
  const r = await request({ contentType: "series", ids: [first, second] });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { ok: true, deleted: 2, seasonsDeleted: 3, episodesDeleted: 3 });
  for (const id of [first, second, e1, e2, e3]) assert.equal(await exists("videos", id), false);
  for (const id of [s1, s2, s3]) assert.equal(await exists("seasons", id), false);
  assert.equal(await queued([first, second, e1, e2, e3]), 5);
  const { rows: [sourceCount] } = await db.query("SELECT count(*)::int AS total FROM series_import_sources");
  assert.equal(sourceCount.total, 0);
});

test("séries: episódio em processamento impede o lote inteiro, sem deleção parcial", async () => {
  const first = await series("Protegida"), second = await series("Também protegida");
  const s1 = await season(first, 1);
  const e1 = await episode(s1, 1, "processing");
  const r = await request({ contentType: "series", ids: [first, second] });
  assert.equal(r.statusCode, 409, r.body);
  assert.equal(await exists("videos", first), true);
  assert.equal(await exists("videos", second), true);
  assert.equal(await exists("videos", e1), true);
  assert.equal(await exists("seasons", s1), true);
  assert.equal(await queued([first, second, e1]), 0);
});
