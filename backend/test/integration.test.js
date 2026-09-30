import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  "postgresql://test:test@localhost:5432/acervo_test";
process.env.APP_ORIGIN = "http://localhost:5173";
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), "acervo-test-"));
process.env.STORAGE_DRIVER = "local";
process.env.MAX_UPLOAD_MB = "2";
const { pool } = await import("../src/db.js");
let embedded;
if (!process.env.TEST_DATABASE_URL) {
  const { PGlite } = await import("@electric-sql/pglite");
  embedded = new PGlite();
  await embedded.waitReady;
  const execute = async (text, values) => {
    if (!values?.length && text.includes(";")) {
      const rows = await embedded.exec(text);
      return { ...rows.at(-1), rowCount: rows.at(-1)?.affectedRows || 0 };
    }
    const result = await embedded.query(text, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  pool.query = execute;
  pool.connect = async () => ({ query: execute, release() {}, on() {} });
}
const { migrate } = await import("../src/migrate.js");
await migrate();
const { createUser } = await import("../src/security.js");
const admin = await createUser({
  name: "Admin teste",
  email: `${randomUUID()}@test.local`,
  password: "Teste-seguro-1234",
  role: "admin",
});
const viewer = await createUser({
  name: "Espectador",
  email: `${randomUUID()}@test.local`,
  password: "Teste-seguro-5678",
  role: "viewer",
});
const { buildApp } = await import("../src/app.js");
const { processOne, collectGarbage } = await import("../src/worker.js");
const { parseRange } = await import("../src/storage.js");
const app = await buildApp({ logger: false });
let adminSession, viewerSession, category, video;
async function login(user, password) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: process.env.APP_ORIGIN },
    payload: { email: user.email, password },
  });
  assert.equal(res.statusCode, 200, res.body);
  return {
    cookie: res.cookies[0].name + "=" + res.cookies[0].value,
    csrf: res.json().csrf,
  };
}
async function request(
  method,
  url,
  body,
  session = adminSession,
  headers = {},
) {
  return app.inject({
    method,
    url,
    headers: {
      origin: process.env.APP_ORIGIN,
      ...(session
        ? { cookie: session.cookie, "x-csrf-token": session.csrf }
        : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { payload: body }),
  });
}
function multipart(fields, file, filename = "sample.mp4") {
  const boundary = "test-" + randomUUID();
  const chunks = [];
  for (const [name, value] of Object.entries(fields))
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="video"; filename="${filename}"\r\nContent-Type: video/mp4\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  );
  return {
    body: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}
after(async () => {
  await app.close();
  await pool.end();
  await embedded?.close();
  await rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});
test("fluxo completo de API, permissões, processamento e persistência", async (t) => {
  await t.test("catálogo privado e credenciais inválidas", async () => {
    assert.equal(
      (await request("GET", "/api/videos", undefined, null)).statusCode,
      401,
    );
    assert.equal(
      (
        await request(
          "POST",
          "/api/auth/login",
          { email: admin.email, password: "wrong" },
          null,
        )
      ).statusCode,
      401,
    );
    adminSession = await login(admin, "Teste-seguro-1234");
    viewerSession = await login(viewer, "Teste-seguro-5678");
    const me = await request("GET", "/api/auth/me");
    assert.equal(me.json().user.role, "admin");
  });
  await t.test("CSRF, origem e autorização do admin", async () => {
    assert.equal(
      (
        await request(
          "POST",
          "/api/categories",
          { name: "Teste" },
          viewerSession,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request(
          "POST",
          "/api/categories",
          { name: "Teste" },
          adminSession,
          { "x-csrf-token": "wrong" },
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await request(
          "POST",
          "/api/categories",
          { name: "Teste" },
          adminSession,
          { origin: "https://evil.example" },
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (await request("POST", "/api/categories", { name: "" })).statusCode,
      400,
    );
  });
  await t.test("categorias CRUD e unicidade", async () => {
    const res = await request("POST", "/api/categories", { name: "Projetos" });
    assert.equal(res.statusCode, 201, res.body);
    category = res.json();
    assert.equal(
      (await request("POST", "/api/categories", { name: "projetos" }))
        .statusCode,
      409,
    );
    assert.equal(
      (
        await request("PUT", `/api/categories/${category.id}`, {
          name: "Projetos pessoais",
        })
      ).statusCode,
      200,
    );
  });
  await t.test("vídeo externo: validação, persistência, edição, publicação e permissões", async () => {
    async function createExternal(overrides = {}, session = adminSession) {
      const boundary = "external-" + randomUUID();
      const fields = { title: "Vídeo externo", categoryId: category.id, published: "true", sourceType: "external", externalUrl: "https://www.youtube.com/embed/abc123", duration: "120", ...overrides };
      const body = Object.entries(fields).map(([key, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`).join("") + `--${boundary}--\r\n`;
      return request("POST", "/api/videos", body, session, { "content-type": `multipart/form-data; boundary=${boundary}` });
    }
    assert.equal((await createExternal({}, viewerSession)).statusCode, 403);
    for (const url of ["javascript:alert(1)", "http://www.youtube.com/embed/abc", "https://localhost/embed/a", "https://www.youtube.com.evil.test/embed/a", "https://user:pass@www.youtube.com/embed/a", '<iframe src="https://www.youtube.com/embed/a"></iframe>', "https://www.youtube.com/watch?v=a", ""]) {
      assert.equal((await createExternal({ externalUrl: url })).statusCode, 400, url);
    }
    assert.equal((await createExternal({ contentType: "invalid" })).statusCode, 400);
    const series = await createExternal({ contentType: "series", title: "Minha série" });
    assert.equal(series.statusCode, 201, series.body);
    const seriesId = series.json().id;
    assert.equal((await request("GET", `/api/videos/${seriesId}`)).json().contentType, "series");
    assert.equal((await pool.query("SELECT content_type FROM videos WHERE id=$1", [seriesId])).rows[0].content_type, "series");
    const meta = { title: "Minha série", categoryId: category.id, published: true };
    assert.equal((await request("PUT", `/api/videos/${seriesId}`, meta)).json().contentType, "series");
    assert.equal((await request("PUT", `/api/videos/${seriesId}`, { ...meta, contentType: "invalid" })).statusCode, 400);
    assert.equal((await request("PUT", `/api/videos/${seriesId}`, { ...meta, contentType: "movie" }, viewerSession)).statusCode, 403);
    await request("PUT", `/api/favorites/${seriesId}`, undefined, viewerSession);
    for (const endpoint of ["videos", "search?q=Minha", "admin/videos", "favorites"]) {
      const separator = endpoint.includes("?") ? "&" : "?";
      const session = endpoint === "favorites" ? viewerSession : adminSession;
      const filtered = await request("GET", `/api/${endpoint}${separator}contentType=series`, undefined, session);
      assert(filtered.json().items.some(v => v.id === seriesId));
      const movies = await request("GET", `/api/${endpoint}${separator}contentType=movie`, undefined, session);
      assert(!movies.json().items.some(v => v.id === seriesId));
    }
    assert.equal((await request("GET", "/api/videos?contentType=invalid")).statusCode, 400);
    assert.equal((await request("PUT", `/api/videos/${seriesId}`, { ...meta, contentType: "movie" })).json().contentType, "movie");
    await request("DELETE", `/api/videos/${seriesId}`);
    const created = await createExternal();
    assert.equal(created.statusCode, 201, created.body);
    const id = created.json().id;
    let result = await request("GET", `/api/videos/${id}`, undefined, viewerSession);
    assert.equal(result.json().contentType, "movie");
    assert.equal(result.json().sourceType, "external");
    assert.equal(result.json().status, "ready");
    assert.equal(result.json().source, null);
    assert.equal(result.json().mp4Url, null);
    assert.equal(result.json().thumbnail, "/placeholder-video.svg");
    assert.equal(result.json().externalUrl, "https://www.youtube.com/embed/abc123");
    assert.equal((await pool.query("SELECT external_path FROM videos WHERE id=$1", [id])).rows[0].external_path, "/embed/abc123");
    assert.equal((await request("POST", `/api/videos/${id}/retry`)).statusCode, 409);
    assert.equal((await request("POST", "/api/history", { videoId: id, position: 20 }, viewerSession)).statusCode, 409);
    assert.equal((await request("PUT", `/api/favorites/${id}`, undefined, viewerSession)).statusCode, 200);
    const data = { title: "Externo editado", description: "Teste", categoryId: category.id, published: true, externalUrl: "https://player.vimeo.com/video/123456", duration: 60 };
    result = await request("PUT", `/api/videos/${id}`, data);
    assert.equal(result.statusCode, 200, result.body);
    assert.equal(result.json().externalUrl, data.externalUrl);
    assert.equal(result.json().duration, 60);
    const { externalUrl, duration, ...metadataOnly } = data;
    assert(externalUrl && duration);
    result = await request("PUT", `/api/videos/${id}`, { ...metadataOnly, published: false });
    assert.equal(result.json().externalUrl, data.externalUrl);
    assert.equal((await request("GET", `/api/videos/${id}`, undefined, viewerSession)).statusCode, 404);
    assert.equal((await request("DELETE", `/api/videos/${id}`)).statusCode, 200);
    assert.equal((await request("GET", `/api/videos/${id}`)).statusCode, 404);
  });
  await t.test("provedores: troca central, aliases, CSP dinâmica, permissões e reversão", async () => {
    const catalog = await request("GET", "/api/admin/providers");
    assert.equal(catalog.statusCode, 200, catalog.body);
    assert.equal(catalog.json().items.length, 4);
    let provider = catalog.json().items.find(p => p.id === "redecanais");
    assert.equal((await request("GET", "/api/admin/providers", undefined, viewerSession)).statusCode, 403);
    assert.equal((await request("PUT", "/api/admin/providers/redecanais", { baseUrl: "https://videos.example", version: provider.version }, viewerSession)).statusCode, 403);
    assert.equal((await request("PUT", "/api/admin/providers/redecanais", { baseUrl: "https://videos.example", version: provider.version }, adminSession, {"x-csrf-token":"wrong"})).statusCode, 403);
    for (const baseUrl of ["http://videos.example", "https://localhost", "https://127.0.0.1", "https://[::1]", "https://10.0.0.1", "https://user:pass@videos.example", "https://videos.example/path", "https://videos.example?x=1", "https://videos.example/#x", "https://videos.example:123", "https://videos.example;script-src", "javascript:alert(1)"]) {
      assert.equal((await request("PUT", "/api/admin/providers/redecanais", { baseUrl, version: provider.version })).statusCode, 400, baseUrl);
    }
    assert.equal((await request("PUT", "/api/admin/providers/redecanais", { baseUrl: "https://www.youtube.com", version: provider.version })).statusCode, 409);
    const ids = [randomUUID(), randomUUID()];
    for (const id of ids) await pool.query("INSERT INTO videos(id,title,category_id,storage_driver,source_type,status,published,provider_id,external_path) VALUES($1,$2,$3,'local','external','ready',true,'redecanais',$4)", [id,'Filme externo',category.id,`/player3/server.php?server=RCFServer3&subfolder=ondemand&vid=${id}`]);
    await request("PUT", `/api/favorites/${ids[0]}`, undefined, viewerSession);
    const update = await request("PUT", "/api/admin/providers/redecanais", { baseUrl: "https://videos.example", version: provider.version });
    assert.equal(update.statusCode, 200, update.body);
    assert.equal((await request("PUT", "/api/admin/providers/redecanais", { baseUrl: "https://stale.example", version: provider.version })).statusCode, 409);
    for (const id of ids) {
      const video = (await request("GET", `/api/videos/${id}`, undefined, viewerSession)).json();
      assert.equal(video.externalUrl, `https://videos.example/player3/server.php?server=RCFServer3&subfolder=ondemand&vid=${id}`);
      assert.equal(video.providerId, "redecanais");
      const frame = await request("GET", video.playerUrl, undefined, viewerSession);
      assert.equal(frame.statusCode, 200, frame.body);
      assert.match(frame.headers["content-security-policy"], /frame-src https:\/\/videos\.example;/);
      assert.equal(frame.headers["x-frame-options"], "SAMEORIGIN");
      assert.equal(frame.headers["cache-control"], "no-store");
      assert.match(frame.body, /&amp;vid=/);
      assert(!frame.body.includes("sandbox="));
      assert.equal((await request("GET", video.playerUrl, undefined, null)).statusCode, 401);
    }
    // An old URL pasted after changing the domain still resolves to the same provider.
    const { resolveExternal } = await import("../src/external.js");
    assert.deepEqual(await resolveExternal("https://redecanais.af/player3/server.php?vid=OLD"), { providerId: "redecanais", externalPath: "/player3/server.php?vid=OLD" });
    const edit = await request("PUT", `/api/videos/${ids[0]}`, { title: '<script>alert("x")</script>', categoryId: category.id, published: false, externalUrl: "https://redecanais.press/player3/server.php?vid=EDIT" });
    assert.equal(edit.statusCode, 200, edit.body);
    assert.equal(edit.json().externalUrl, "https://videos.example/player3/server.php?vid=EDIT");
    assert.equal((await request("GET", `/api/players/${ids[0]}`, undefined, viewerSession)).statusCode, 404);
    const escaped = await request("GET", `/api/players/${ids[0]}`);
    assert(!escaped.body.includes('<script>'));
    assert.match(escaped.body, /&lt;script&gt;/);
    provider = (await request("GET", "/api/admin/providers")).json().items.find(p => p.id === "redecanais");
    assert.equal(provider.videoCount, 2);
    assert.equal(provider.changes[0].oldUrl, "https://redecanais.press");
    assert.equal(provider.changes[0].newUrl, "https://videos.example");
    assert.equal((await request("PUT", "/api/admin/providers/redecanais", { baseUrl: "https://redecanais.press", version: provider.version })).statusCode, 200);
    for (const id of ids) await request("DELETE", `/api/videos/${id}`);
  });
  await t.test("upload inválido e acima do limite são rejeitados", async () => {
    const fields = {
      title: "Inválido",
      categoryId: category.id,
      published: "true",
    };
    const invalid = multipart(fields, Buffer.from("not a video"));
    assert.equal(
      (
        await request(
          "POST",
          "/api/videos",
          invalid.body,
          adminSession,
          invalid.headers,
        )
      ).statusCode,
      400,
    );
    const big = multipart(fields, Buffer.alloc(2 * 1024 * 1024 + 1));
    assert.equal(
      (
        await request(
          "POST",
          "/api/videos",
          big.body,
          adminSession,
          big.headers,
        )
      ).statusCode,
      413,
    );
  });
  await t.test("upload real para fila, privado até pronto", async () => {
    const file = await readFile(
      new URL("./fixtures/flower.mp4", import.meta.url),
    );
    const form = multipart(
      {
        title: "Meu código",
        description: "Bastidores do laboratório",
        categoryId: category.id,
        published: "true",
      },
      file,
    );
    const res = await request(
      "POST",
      "/api/videos",
      form.body,
      adminSession,
      form.headers,
    );
    assert.equal(res.statusCode, 202, res.body);
    video = res.json();
    assert.equal(
      (await request("GET", "/api/videos", undefined, viewerSession)).json()
        .total,
      0,
    );
    assert.equal(
      (
        await request(
          "GET",
          `/api/media/${video.id}/master.m3u8`,
          undefined,
          viewerSession,
        )
      ).statusCode,
      404,
    );
  });
  await t.test(
    "FFmpeg gera MP4, HLS e thumbnail, publicando o resultado",
    async () => {
      const db = await pool.connect();
      assert.equal(await processOne(db), true);
      db.release();
      const res = await request(
        "GET",
        `/api/videos/${video.id}`,
        undefined,
        viewerSession,
      );
      assert.equal(res.statusCode, 200, res.body);
      assert.equal(res.json().status, "ready", res.body);
      assert(res.json().duration > 0);
      assert(res.json().qualities.length > 0);
      const master = await request(
        "GET",
        `/api/media/${video.id}/master.m3u8`,
        undefined,
        viewerSession,
      );
      assert.equal(master.statusCode, 200, master.body);
      assert.match(master.body, /#EXTM3U/);
      const variant = await request(
        "GET",
        `/api/media/${video.id}/480/index.m3u8`,
        undefined,
        viewerSession,
      );
      assert.equal(variant.statusCode, 200);
      const segment = await request(
        "GET",
        `/api/media/${video.id}/480/segment-00000.ts`,
        undefined,
        viewerSession,
      );
      assert.equal(segment.statusCode, 200);
      assert(segment.rawPayload.length > 0);
      const thumb = await request(
        "GET",
        `/api/media/${video.id}/thumbnail.jpg`,
        undefined,
        viewerSession,
      );
      assert.equal(thumb.statusCode, 200);
    },
  );
  await t.test("Range e mídia protegida", async () => {
    const res = await request(
      "GET",
      `/api/media/${video.id}/playback.mp4`,
      undefined,
      viewerSession,
      { range: "bytes=0-99" },
    );
    assert.equal(res.statusCode, 206, res.body);
    assert.equal(res.rawPayload.length, 100);
    assert.equal(
      (
        await request(
          "GET",
          `/api/media/${video.id}/playback.mp4`,
          undefined,
          null,
        )
      ).statusCode,
      401,
    );
    assert.equal(
      (
        await request(
          "GET",
          `/api/media/${video.id}/original`,
          undefined,
          viewerSession,
        )
      ).statusCode,
      404,
    );
    assert.equal(
      (
        await request(
          "GET",
          `/api/media/${video.id}/playback.mp4`,
          undefined,
          viewerSession,
          { range: "bytes=999999999999-" },
        )
      ).statusCode,
      416,
    );
    assert.deepEqual(parseRange("bytes=-10", 100), { start: 90, end: 99 });
  });
  await t.test(
    "thumbnail válida é recodificada; imagem inválida é rejeitada",
    async () => {
      const { default: sharp } = await import("sharp");
      const image = await sharp({
        create: { width: 32, height: 32, channels: 3, background: "#d2f86a" },
      })
        .png()
        .toBuffer();
      function form(file) {
        const boundary = "thumb-" + randomUUID();
        return {
          body: Buffer.concat([
            Buffer.from(
              `--${boundary}\r\nContent-Disposition: form-data; name="thumbnail"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`,
            ),
            file,
            Buffer.from(`\r\n--${boundary}--\r\n`),
          ]),
          headers: {
            "content-type": `multipart/form-data; boundary=${boundary}`,
          },
        };
      }
      const valid = form(image);
      assert.equal(
        (
          await request(
            "POST",
            `/api/videos/${video.id}/thumbnail`,
            valid.body,
            adminSession,
            valid.headers,
          )
        ).statusCode,
        200,
      );
      const invalid = form(
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',
        ),
      );
      assert.equal(
        (
          await request(
            "POST",
            `/api/videos/${video.id}/thumbnail`,
            invalid.body,
            adminSession,
            invalid.headers,
          )
        ).statusCode,
        400,
      );
    },
  );
  await t.test("busca normaliza acentos e paginação", async () => {
    assert.equal(
      (
        await request("GET", "/api/search?q=codigo", undefined, viewerSession)
      ).json().total,
      1,
    );
    assert.equal(
      (
        await request(
          "GET",
          "/api/search?q=laboratorio",
          undefined,
          viewerSession,
        )
      ).json().total,
      1,
    );
    assert.equal(
      (
        await request(
          "GET",
          "/api/search?q=naoexiste",
          undefined,
          viewerSession,
        )
      ).json().total,
      0,
    );
    assert.equal(
      (
        await request("GET", "/api/videos?offset=1", undefined, viewerSession)
      ).json().items.length,
      0,
    );
  });
  await t.test("favoritos e histórico isolados por usuário", async () => {
    assert.equal(
      (
        await request(
          "PUT",
          `/api/favorites/${video.id}`,
          undefined,
          viewerSession,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/favorites", undefined, viewerSession)).json()
        .total,
      1,
    );
    assert.equal((await request("GET", "/api/favorites")).json().total, 0);
    assert.equal(
      (
        await request(
          "POST",
          "/api/history",
          { videoId: video.id, position: 2 },
          viewerSession,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/history", undefined, viewerSession)).json()
        .items[0].position,
      2,
    );
    await request(
      "POST",
      "/api/history",
      { videoId: video.id, position: 999999, ended: true },
      viewerSession,
    );
    assert.equal(
      (await request("GET", "/api/history", undefined, viewerSession)).json()
        .total,
      0,
    );
    await request(
      "DELETE",
      `/api/favorites/${video.id}`,
      undefined,
      viewerSession,
    );
    assert.equal(
      (await request("GET", "/api/favorites", undefined, viewerSession)).json()
        .total,
      0,
    );
  });
  await t.test("visualização deduplicada por usuário/dia", async () => {
    await request(
      "POST",
      `/api/videos/${video.id}/view`,
      undefined,
      viewerSession,
    );
    await request(
      "POST",
      `/api/videos/${video.id}/view`,
      undefined,
      viewerSession,
    );
    assert.equal(
      (await request("GET", `/api/videos/${video.id}`)).json().views,
      1,
    );
  });
  await t.test(
    "despublicar revoga acesso inclusive aos segmentos",
    async () => {
      const data = {
        title: "Título editado",
        description: "Descrição",
        categoryId: category.id,
        published: false,
      };
      assert.equal(
        (await request("PUT", `/api/videos/${video.id}`, data)).statusCode,
        200,
      );
      assert.equal(
        (
          await request(
            "GET",
            `/api/media/${video.id}/480/segment-00000.ts`,
            undefined,
            viewerSession,
          )
        ).statusCode,
        404,
      );
      assert.equal(
        (await request("DELETE", `/api/categories/${category.id}`)).statusCode,
        409,
      );
    },
  );
  await t.test(
    "exclusão remove vínculos e coloca mídia na limpeza persistida",
    async () => {
      assert.equal(
        (await request("DELETE", `/api/videos/${video.id}`)).statusCode,
        200,
      );
      const db = await pool.connect();
      await collectGarbage(db);
      db.release();
      assert.equal(
        (await request("GET", `/api/videos/${video.id}`)).statusCode,
        404,
      );
      assert.equal(
        (await request("DELETE", `/api/categories/${category.id}`)).statusCode,
        200,
      );
    },
  );
  await t.test("logout revoga sessão", async () => {
    assert.equal(
      (await request("POST", "/api/auth/logout", undefined, viewerSession))
        .statusCode,
      200,
    );
    assert.equal(
      (await request("GET", "/api/auth/me", undefined, viewerSession))
        .statusCode,
      401,
    );
  });
  await t.test(
    "falha de processamento pode ser reprocessada e excluída",
    async () => {
      const {
        rows: [c],
      } = await pool.query(
        "INSERT INTO categories(id,name) VALUES($1,$2) RETURNING id",
        [randomUUID(), "Falha e retry"],
      );
      const id = randomUUID();
      await pool.query(
        "INSERT INTO videos(id,title,category_id,storage_driver) VALUES($1,$2,$3,'local')",
        [id, "Teste de recuperação", c.id],
      );
      const client = await pool.connect();
      await processOne(client);
      assert.equal(
        (await request("GET", `/api/videos/${id}`)).json().status,
        "failed",
      );
      const directory = path.join(process.env.STORAGE_DIR, "spool", id);
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, "source"),
        await readFile(new URL("./fixtures/flower.mp4", import.meta.url)),
      );
      assert.equal(
        (await request("POST", `/api/videos/${id}/retry`)).statusCode,
        200,
      );
      await processOne(client);
      assert.equal(
        (await request("GET", `/api/videos/${id}`)).json().status,
        "ready",
      );
      await request("DELETE", `/api/videos/${id}`);
      await collectGarbage(client);
      client.release();
      await request("DELETE", `/api/categories/${c.id}`);
    },
  );
});

test("HLS gera 1080p, 720p e 480p sem áudio", async () => {
  const { run, transcode } = await import("../src/media.js");
  const temporary = await mkdtemp(path.join(os.tmpdir(), "acervo-hls-"));
  try {
    const source = path.join(temporary, "sample.mp4");
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=1920x1080:rate=24",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-threads",
      "2",
      source,
    ]);
    const result = await transcode(source, path.join(temporary, "out"));
    assert.deepEqual(
      result.qualities.map((q) => q.height),
      [480, 720, 1080],
    );
    for (const height of [480, 720, 1080])
      assert.match(
        await readFile(
          path.join(temporary, "out", String(height), "index.m3u8"),
          "utf8",
        ),
        /#EXT-X-ENDLIST/,
      );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
