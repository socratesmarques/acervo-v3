import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const migration = name => readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const migrationSql = await migration("003_providers.sql");
test("migration 003 preserva vídeos, parâmetros, favoritos e converte .af/.press", async () => {
  const db = new PGlite();
  try {
    await db.exec(await migration("001_initial.sql"));
    await db.exec(await migration("002_external_videos.sql"));
    const user = randomUUID(), category = randomUUID();
    await db.query("INSERT INTO users(id,name,email,password_hash) VALUES($1,'Teste','teste@example.com','unused')", [user]);
    await db.query("INSERT INTO categories(id,name) VALUES($1,'Teste')", [category]);
    const refs = [
      ["https://redecanais.af", "/player3/server.php?server=RCFServer3&subfolder=ondemand&vid=AB%2FCD", "redecanais"],
      ["https://redecanais.press", "/player3/server.php?vid=NOVO#play", "redecanais"],
      ["https://www.youtube.com", "/embed/test123", "youtube"],
    ];
    const ids = [];
    for (const [origin, path] of refs) {
      const id = randomUUID(); ids.push(id);
      await db.query("INSERT INTO videos(id,title,category_id,storage_driver,source_type,external_url,status,published) VALUES($1,'Preservado',$2,'local','external',$3,'ready',true)", [id,category,origin+path]);
      await db.query("INSERT INTO favorites(user_id,video_id) VALUES($1,$2)", [user,id]);
    }
    const uploadId = randomUUID();
    await db.query("INSERT INTO videos(id,title,category_id,storage_driver) VALUES($1,'Upload',$2,'local')", [uploadId,category]);
    await db.exec(migrationSql);
    for (let i = 0; i < ids.length; i++) {
      const {rows:[v]} = await db.query("SELECT * FROM videos WHERE id=$1", [ids[i]]);
      assert.equal(v.provider_id, refs[i][2]);
      assert.equal(v.external_path, refs[i][1]);
      assert.equal(v.legacy_external_url, refs[i][0]+refs[i][1]);
      assert.equal(v.title, "Preservado");
      assert.equal(v.published, true);
    }
    assert.equal((await db.query("SELECT count(*)::int AS total FROM favorites")).rows[0].total,3);
    const {rows:[upload]} = await db.query("SELECT * FROM videos WHERE id=$1",[uploadId]);
    assert.equal(upload.source_type,"upload");
    assert.equal(upload.provider_id,null);
    await db.query("UPDATE providers SET base_url='https://novo.example' WHERE id='redecanais'");
    const {rows} = await db.query("SELECT p.base_url||v.external_path AS url FROM videos v JOIN providers p ON p.id=v.provider_id WHERE p.id='redecanais'");
    await db.exec(await migration("004_content_type.sql"));
    const classified = await db.query("SELECT id,content_type FROM videos");
    assert.equal(classified.rows.length, 4);
    assert(classified.rows.every(v => v.content_type === "movie"));
    assert.equal((await db.query("SELECT count(*)::int AS total FROM favorites")).rows[0].total, 3);
    await db.query("UPDATE videos SET content_type='series' WHERE id=$1", [uploadId]);
    await assert.rejects(() => db.query("UPDATE videos SET content_type='invalid' WHERE id=$1", [uploadId]));
    assert.equal(rows.length,2);
    assert(rows.every(v=>v.url.startsWith("https://novo.example/player3/server.php?")));
  } finally { await db.close(); }
});
test("migration 003 falha atomicamente quando encontra domínio desconhecido", async () => {
  const db = new PGlite();
  try {
    await db.exec(await migration("001_initial.sql"));
    await db.exec(await migration("002_external_videos.sql"));
    const id=randomUUID(), category=randomUUID();
    await db.query("INSERT INTO categories(id,name) VALUES($1,'Teste')",[category]);
    await db.query("INSERT INTO videos(id,title,category_id,storage_driver,source_type,external_url,status) VALUES($1,'Preservado',$2,'local','external','https://unknown.example/embed/a','ready')",[id,category]);
    await db.exec("BEGIN");
    await assert.rejects(()=>db.exec(migrationSql),/domínios não reconhecidos/);
    await db.exec("ROLLBACK");
    assert.equal((await db.query("SELECT external_url FROM videos WHERE id=$1",[id])).rows[0].external_url,"https://unknown.example/embed/a");
    assert.equal((await db.query("SELECT to_regclass('providers') AS name")).rows[0].name,null);
  } finally { await db.close(); }
});
