import assert from "node:assert/strict";
import { createServer, request as httpRequest } from "node:http";
import { readFile, mkdtemp, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { PGlite } from "@electric-sql/pglite";
const root = fileURLToPath(new URL("../../", import.meta.url)),
  dist = path.join(root, "frontend/dist");
let apiPort;
const gateway = createServer(async (req, res) => {
  if (req.url.startsWith("/api/")) {
    const proxy = httpRequest(
      {
        host: "127.0.0.1",
        port: apiPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (upstream) => {
        res.writeHead(upstream.statusCode, upstream.headers);
        upstream.pipe(res);
      },
    );
    proxy.on("error", () => {
      res.statusCode = 502;
      res.end();
    });
    req.pipe(proxy);
    return;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    const asset =
      url.pathname.startsWith("/assets/") || ["/favicon.svg", "/placeholder-video.svg"].includes(url.pathname);
    const filename = asset
      ? path.join(
          dist,
          ["favicon.svg", "placeholder-video.svg"].includes(path.basename(url.pathname))
            ? path.basename(url.pathname)
            : `assets/${path.basename(url.pathname)}`,
        )
      : path.join(dist, "index.html");
    const content = await readFile(filename);
    res.setHeader(
      "Content-Type",
      {
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".html": "text/html",
      }[path.extname(filename)] || "application/octet-stream",
    );
    const nginx = await readFile(path.join(root, "frontend/nginx.conf"), "utf8");
    res.setHeader("Content-Security-Policy", nginx.match(/add_header Content-Security-Policy "([^"]+)"/)[1]);
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${gateway.address().port}`;
process.env.DATABASE_URL = "postgresql://unused:unused@localhost/test";
process.env.APP_ORIGIN = origin;
process.env.STORAGE_DIR = await mkdtemp(
  path.join(os.tmpdir(), "acervo-browser-"),
);
process.env.STORAGE_DRIVER = "local";
const { pool } = await import("../src/db.js");
const db = new PGlite();
await db.waitReady;
const execute = async (text, values) => {
  if (!values?.length && text.includes(";")) {
    const results = await db.exec(text);
    return { ...results.at(-1), rowCount: results.at(-1)?.affectedRows || 0 };
  }
  const result = await db.query(text, values);
  return { ...result, rowCount: result.affectedRows ?? result.rows.length };
};
pool.query = execute;
pool.connect = async () => ({ query: execute, release() {}, on() {} });
const { migrate } = await import("../src/migrate.js");
await migrate();
const { createUser } = await import("../src/security.js");
await createUser({
  name: "Sócrates",
  email: "browser@test.local",
  password: "Senha-de-teste-1234",
  role: "admin",
});
const { buildApp } = await import("../src/app.js"),
  { processOne } = await import("../src/worker.js");
const app = await buildApp({ logger: false });
await app.listen({ host: "127.0.0.1", port: 0 });
apiPort = app.server.address().port;
let launch = { headless: true };
if (process.env.CHROMIUM_EXECUTABLE)
  launch = {
    ...launch,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    args: [
      "--no-sandbox",
      "--single-process",
      "--no-zygote",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  };
// Optional binary override for CI; normal usage relies on `npx playwright install chromium`.
if (process.env.CHROMIUM_MODULE) {
  const { default: custom } = await import(process.env.CHROMIUM_MODULE);
  launch = {
    ...launch,
    args: custom.args.filter((arg) => arg !== "--disable-web-security"),
    executablePath: await custom.executablePath(),
  };
}
const browser = await chromium.launch(launch);
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage(),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await mkdir(path.join(root, "backend/test-results"), { recursive: true });
try {
  await page.goto(origin);
  await page.getByLabel("E-mail", { exact: true }).fill("browser@test.local");
  await page.getByLabel("Senha", { exact: true }).fill("Senha-de-teste-1234");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("link", { name: "Enviar primeiro vídeo" }).waitFor();
  await page.goto(origin + "/admin/categories");
  await page.getByLabel("Nova categoria").fill("Viagens");
  await page.getByRole("button", { name: "Criar", exact: true }).click();
  await page.getByText("Viagens", { exact: true }).waitFor();
  await page.goto(origin + "/admin/upload");
  await page.getByLabel("Título", { exact: true }).fill("Uma pausa no jardim");
  await page
    .getByLabel("Descrição", { exact: true })
    .fill("Um pequeno momento para testar nosso acervo.");
  await page
    .locator("select[name=categoryId]")
    .selectOption({ label: "Viagens" });
  await page
    .locator("input[name=video]")
    .setInputFiles(path.join(root, "backend/test/fixtures/flower.mp4"));
  await page.getByRole("button", { name: "Enviar vídeo", exact: true }).click();
  await page.waitForURL("**/admin/videos");
  const client = await pool.connect();
  await processOne(client);
  await page.goto(origin);
  await page.getByRole("link", { name: "Assistir agora" }).waitFor();
  await page.screenshot({
    path: path.join(root, "backend/test-results/home-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: "Assistir agora" }).click();
  await page.getByRole("button", { name: "Reproduzir", exact: true }).waitFor();
  await page.getByRole("button", { name: "Minha lista", exact: true }).click();
  await page
    .getByRole("button", { name: "Na minha lista", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Reproduzir", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("video")?.currentTime > 0.2,
  );
  await page.getByRole("button", { name: "Pausar", exact: true }).click();
  await page.getByRole("slider", { name: "Posição do vídeo" }).fill("3.3");
  const historySaved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/history") &&
      r.request().method() === "POST" &&
      r.status() === 200,
  );
  await page
    .getByRole("slider", { name: "Posição do vídeo" })
    .press("ArrowRight");
  await historySaved;
  await page.screenshot({
    path: path.join(root, "backend/test-results/player-desktop.png"),
    fullPage: true,
  });
  const videoUrl = page.url();
  await page.goto(origin + "/minha-lista");
  await page
    .getByRole("link", { name: "Assistir Uma pausa no jardim" })
    .waitFor();
  await page.goto(videoUrl);
  await page.getByText("Continuar de onde parou?", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Do início", exact: true }).click();
  await page.goto(origin + "/buscar?q=jardim");
  await page
    .getByRole("link", { name: "Assistir Uma pausa no jardim" })
    .waitFor();
  await page.goto(origin + "/admin");
  await page.getByText("Seu acervo em números.").waitFor();
  await page.screenshot({
    path: path.join(root, "backend/test-results/admin-desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin);
  await page.getByRole("link", { name: "Assistir agora" }).waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: path.join(root, "backend/test-results/home-mobile.png"),
    fullPage: true,
  });
  await page.goto(origin + "/admin/upload");
  await page.getByLabel("Título", { exact: true }).waitFor();
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  // No third-party network dependency: verify iframe integration with a controlled response.
  await page.route("https://www.youtube.com/embed/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<h1>Player externo de teste</h1>" }));
  await page.getByLabel("Origem do vídeo").selectOption("external");
  assert.equal(await page.locator('input[name="video"]').count(), 0);
  await page.getByLabel("Título", { exact: true }).fill("Externo de teste");
  await page.getByLabel("URL de incorporação").fill("https://www.youtube.com/embed/test123");
  await page.getByLabel("Duração em segundos (opcional)").fill("90");
  await page.locator("select[name=categoryId]").selectOption({ label: "Viagens" });
  await page.screenshot({ path: path.join(root, "backend/test-results/external-form-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Cadastrar vídeo externo" }).click();
  await page.waitForURL("**/admin/videos");
  const row = page.getByRole("row").filter({ hasText: "Externo de teste" });
  await row.getByRole("link", { name: "Editar", exact: true }).click();
  assert.equal(await page.locator("select[name=contentType]").count(), 0);
  await page.getByLabel("URL de incorporação").fill("https://www.youtube.com/embed/edited123");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page.waitForURL("**/admin/videos");
  await page.getByRole("row").filter({ hasText: "Externo de teste" }).getByRole("link", { name: "Assistir", exact: true }).click();
  await page.getByRole("button", { name: "Carregar vídeo externo" }).click();
  await page.frameLocator("iframe").frameLocator("iframe").getByText("Player externo de teste").waitFor();
  assert.equal(await page.frameLocator("iframe").locator("iframe").getAttribute("src"), "https://www.youtube.com/embed/edited123");
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(root, "backend/test-results/external-player-mobile.png"), fullPage: true });
  const externalWatchUrl = page.url();
  await page.goto(origin + "/admin/providers");
  await page.getByRole("heading", { name: "Provedores", exact: true }).waitFor();
  const youtubeProvider = page.locator("article").filter({ has: page.getByRole("heading", {name: "YouTube", exact: true}) });
  await youtubeProvider.getByLabel("Domínio de YouTube", { exact: true }).fill("https://player.example");
  page.once("dialog", dialog => dialog.accept());
  await youtubeProvider.getByRole("button", {name: "Salvar domínio"}).click();
  await page.getByRole("status").filter({ hasText: "Domínio atualizado" }).waitFor();
  await page.screenshot({ path: path.join(root, "backend/test-results/providers-mobile.png"), fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.route("https://player.example/embed/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: "<h1>Novo domínio funcionando</h1>" }));
  await page.goto(externalWatchUrl);
  await page.getByRole("button", { name: "Carregar vídeo externo" }).click();
  await page.frameLocator("iframe").frameLocator("iframe").getByText("Novo domínio funcionando").waitFor();
  assert.equal(await page.frameLocator("iframe").locator("iframe").getAttribute("src"), "https://player.example/embed/edited123");
  // Real series/season/episode forms and navigation, with a controlled provider iframe.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(origin + "/admin/series");
  await page.getByRole("link", { name: "Nova série", exact: true }).click();
  await page.getByRole("heading", { name: "Uma série, várias histórias." }).waitFor();
  assert.equal(await page.locator('input[name="video"]').count(), 0);
  assert.equal(await page.locator('input[name="externalUrl"]').count(), 0);
  await page.getByLabel("Nome da série", { exact: true }).fill("Horizontes");
  await page.locator("select[name=categoryId]").selectOption({ label: "Viagens" });
  await page.getByRole("button", { name: "Criar série", exact: true }).click();
  await page.getByRole("heading", { name: "Temporadas e episódios" }).waitFor();
  const seriesAdminUrl = page.url();
  const seriesId = new URL(seriesAdminUrl).pathname.split("/").at(-1);

  await page.getByRole("link", { name: "Adicionar episódio", exact: true }).click();
  await page.getByRole("heading", { name: "Novo episódio", exact: true }).waitFor();
  await page.getByLabel("Título", { exact: true }).fill("A partida");
  await page.getByLabel("URL de incorporação").fill("https://www.youtube.com/embed/series1");
  await page.getByRole("button", { name: "Cadastrar vídeo externo", exact: true }).click();
  await page.getByText("1. A partida", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Criar temporada", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Temporada salva." }).waitFor();
  await page.getByRole("link", { name: "Adicionar episódio", exact: true }).click();
  await page.getByRole("heading", { name: "Novo episódio", exact: true }).waitFor();
  await page.getByLabel("Título", { exact: true }).fill("O retorno");
  await page.getByLabel("URL de incorporação").fill("https://www.youtube.com/embed/series2");
  await page.getByRole("button", { name: "Cadastrar vídeo externo", exact: true }).click();
  await page.locator('.season-toolbar select').selectOption({ label: "Temporada 2" });
  await page.getByText("1. O retorno", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, "backend/test-results/series-admin-desktop.png"), fullPage: true });
  await page.goto(origin + "/admin/series");
  await page.getByText("2 temporada(s) · 2 episódio(s)", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(root, "backend/test-results/series-list-desktop.png"), fullPage: true });
  await page.goto(origin + "/admin/videos");
  await page.getByRole("heading", { name: "Filmes e vídeos", exact: true }).waitFor();
  assert.equal(await page.getByRole("row").filter({ hasText: "Horizontes" }).count(), 0);
  await page.goto(origin + "/admin/videos/" + seriesId);
  await page.waitForURL(seriesAdminUrl);
  await page.locator('.season-toolbar select').selectOption({ label: "Temporada 2" });
  await page.getByLabel("Link ou ID do vídeo no ACERVO").fill(externalWatchUrl);
  await page.getByRole("button", { name: "Vincular episódio", exact: true }).click();
  await page.getByText("2. Externo de teste", { exact: true }).waitFor();
  await page.goto(origin + `/video/${seriesId}`);
  await page.getByRole("link", { name: /A partida/ }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  await page.screenshot({ path: path.join(root, "backend/test-results/series-desktop.png"), fullPage: true });
  await page.getByRole("link", { name: /A partida/ }).click();
  await page.getByRole("button", { name: "Carregar vídeo externo" }).click();
  await page.frameLocator("iframe").frameLocator("iframe").getByText("Novo domínio funcionando").waitFor();
  assert.equal(await page.frameLocator("iframe").locator("iframe").getAttribute("src"), "https://player.example/embed/series1");
  await page.getByRole("link", { name: "Próximo episódio" }).click();
  await page.getByRole("heading", { name: "O retorno", exact: true, level: 1 }).waitFor();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(await page.getByLabel("Selecionar temporada").inputValue(), (await db.query("SELECT id FROM seasons WHERE series_id=$1 AND number=2", [seriesId])).rows[0].id);
  await page.getByRole("button", { name: "Carregar vídeo externo" }).click();
  await page.frameLocator("iframe").frameLocator("iframe").getByText("Novo domínio funcionando").waitFor();
  assert.equal(await page.frameLocator("iframe").locator("iframe").getAttribute("src"), "https://player.example/embed/series2");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(origin + `/video/${seriesId}`);
  await page.getByLabel("Selecionar temporada").selectOption({ label: "Temporada 2" });
  await page.getByRole("link", { name: /O retorno/ }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(root, "backend/test-results/series-mobile.png"), fullPage: true });
  await page.goto(origin + "/admin/series");
  await page.getByText("2 temporada(s) · 3 episódio(s)", { exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(root, "backend/test-results/series-list-mobile.png"), fullPage: true });
  await page.goto(seriesAdminUrl);
  await page.getByRole("heading", { name: "Temporadas e episódios" }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.goto(origin + "/perfil");
  await page.getByLabel("Senha atual").fill("Senha-de-teste-1234");
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("Outra-senha-de-teste-5678");
  await page
    .getByLabel("Confirmar nova senha")
    .fill("Outra-senha-de-teste-5678");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await page.getByRole("button", { name: "Entrar", exact: true }).waitFor();
  // O fragmento deve sobreviver ao login, sem enviar dados do importador na URL HTTP.
  const imported = { version: 1, title: "Patrulha Canina — Ação", description: "Prévia da extensão", externalUrl: "https://www.youtube.com/embed/import-test" };
  const importUrl = origin + "/admin/import#" + encodeURIComponent(JSON.stringify(imported));
  await page.goto(importUrl);
  await page.getByLabel("E-mail", { exact: true }).fill("browser@test.local");
  await page.getByLabel("Senha", { exact: true }).fill("Outra-senha-de-teste-5678");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: "Revise o conteúdo capturado." }).waitFor();
  assert.equal(await page.getByLabel("Título", { exact: true }).inputValue(), imported.title);
  await page.locator("select[name=categoryId]").selectOption({ label: "Viagens" });
  await page.screenshot({ path: path.join(root, "backend/test-results/import-mobile.png"), fullPage: true });
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await page.getByRole("heading", { name: "Rascunho salvo." }).waitFor();
  await page.goto(importUrl);
  await page.reload();
  await page.locator("select[name=categoryId]").selectOption({ label: "Viagens" });
  await page.getByRole("button", { name: "Salvar rascunho" }).click();
  await page.getByRole("heading", { name: "Este player já está no acervo." }).waitFor();
  await page.goto(origin + "/admin/import#invalid");
  await page.getByRole("alert").waitFor();
  // HTML controlado reproduz o formato de iframe codificado da imagem do usuário.
  const extraction = await readFile(path.join(root, "extension/extract.js"), "utf8");
  const fixture = await context.newPage();
  await fixture.route("https://catalog.example/**", route => route.fulfill({ contentType: "text/html; charset=utf-8", body: '<title>Embed</title><meta property="og:title" content="Patrulha Canina - RedeCanais"><textarea>&lt;iframe src="//%72%65%64%65%63%61%6e%61%69%73.press/player3/server.php?vid=TEST&amp;server=A"&gt;&lt;/iframe&gt;</textarea>' }));
  await fixture.goto("https://catalog.example/movie");
  const captured = await fixture.evaluate(extraction);
  assert.equal(captured.title, "Patrulha Canina");
  assert.equal(captured.urls[0], "https://redecanais.press/player3/server.php?vid=TEST&server=A");
  await fixture.route("https://catalog.example/embed/**", route => route.fulfill({ contentType: "text/html", body: '<title>Embed</title><a href="/player3/embed.api?embed=' + Buffer.from('player3/server.php?vid=ABC&server=B').toString('base64') + '">Embed</a><iframe src="javascript:alert(1)"></iframe>' }));
  await fixture.goto("https://catalog.example/embed/test");
  const encoded = await fixture.evaluate(extraction);
  assert.equal(encoded.title, "");
  assert.deepEqual(encoded.urls, ["https://catalog.example/player3/server.php?vid=ABC&server=B"]);
  await fixture.close();
  // Real popup and same-origin bridge/API; browser extension APIs are simulated.
  const { requestOnSite } = await import("../../extension/bridge.js");
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 400, height: 760 });
  popup.on("pageerror", (e) => errors.push(e.message));
  await popup.exposeFunction("acervoRpc", async (message) => {
    return page.evaluate(requestOnSite, { origin: message.origin, operation: message.action === "save" ? "save" : "options", body: message.body });
  });
  await popup.addInitScript(({ captured }) => {
    window.sentToAcervo = null;
    window.close = () => {};
    window.chrome = {
      storage: {
        local: {
          get: async () => JSON.parse(localStorage.getItem("extensionSettings") || "{}"),
          set: async (data) => localStorage.setItem("extensionSettings", JSON.stringify({ ...JSON.parse(localStorage.getItem("extensionSettings") || "{}"), ...data })),
        },
        session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
      },
      tabs: { query: async () => [{ id: 1, url: "https://catalog.example/movie" }], create: async data => { window.sentToAcervo = data.url; } },
      scripting: { executeScript: async () => [{ result: JSON.parse(localStorage.getItem("captureOverride") || "null") || captured }] },
      permissions: { request: async () => true, contains: async () => true },
      runtime: { sendMessage: (message) => window.acervoRpc(message) },
    };
  }, { captured });
  await popup.route("https://extension.example/**", async route => {
    const filename = new URL(route.request().url()).pathname.slice(1);
    const contentType = filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html; charset=utf-8";
    await route.fulfill({ contentType, body: await readFile(path.join(root, "extension", filename)) });
  });
  await popup.goto("https://extension.example/popup.html");
  await popup.getByText("Nome preenchido automaticamente. Confira antes de enviar.").waitFor();
  assert.equal(await popup.getByLabel("Nome do filme ou série").inputValue(), "Patrulha Canina");
  await popup.getByLabel("Endereço do seu ACERVO").fill(origin);
  await popup.screenshot({ path: path.join(root, "backend/test-results/extension-popup.png"), fullPage: true });
  await popup.getByRole("button", { name: "Revisar no painel", exact: true }).click();
  await popup.waitForFunction(() => window.sentToAcervo !== null);
  const target = new URL(await popup.evaluate(() => window.sentToAcervo));
  assert.equal(target.origin, origin);
  assert.equal(target.pathname, "/admin/import");
  assert.equal(JSON.parse(decodeURIComponent(target.hash.slice(1))).title, "Patrulha Canina");
  // Connect once and remember an episode destination. Saves go through the real bridge/API.
  await popup.getByRole("button", { name: "Conectar", exact: true }).click();
  await popup.getByText("Conectado. Escolha o destino uma vez; ele será lembrado.").waitFor();
  await popup.getByLabel("Adicionar como").selectOption("episode");
  await popup.locator("#series").selectOption({ label: "Horizontes" });
  await popup.locator("#season").selectOption({ label: "T1" });
  await popup.getByLabel("Publicar ao salvar").check();
  await popup.screenshot({ path: path.join(root, "backend/test-results/extension-episode.png"), fullPage: true });
  await popup.getByRole("button", { name: "Publicar episódio", exact: true }).click();
  await popup.getByRole("status").filter({ hasText: "Episódio 2 publicado:" }).waitFor();
  const savedEpisode = (await db.query("SELECT v.*,s.series_id FROM videos v JOIN seasons s ON s.id=v.season_id WHERE v.title=$1", [captured.title])).rows[0];
  assert.equal(savedEpisode.series_id, seriesId); assert.equal(savedEpisode.episode_number, 2); assert.equal(savedEpisode.published, true);
  await popup.getByRole("button", { name: "Publicar episódio", exact: true }).click();
  await popup.getByRole("status").filter({ hasText: "Já cadastrado:" }).waitFor();
  assert.equal((await db.query("SELECT count(*)::int AS n FROM videos WHERE title=$1", [captured.title])).rows[0].n, 1);
  // Reopen on the next source page: preferences restored, only the save click is necessary.
  await popup.evaluate((captured) => localStorage.setItem("captureOverride", JSON.stringify({ ...captured, title: "Próximo episódio capturado", urls: ["https://redecanais.af/player3/server.php?vid=NEXT"] })), captured);
  await popup.reload();
  await popup.getByRole("button", { name: "Publicar episódio", exact: true }).waitFor({ state: "visible" });
  await popup.waitForFunction(() => !document.querySelector('#send').disabled);
  assert.equal(await popup.locator('#series').inputValue(), seriesId);
  assert.equal(await popup.locator('#episode').inputValue(), '');
  await popup.getByRole("button", { name: "Publicar episódio", exact: true }).click();
  await popup.getByRole("status").filter({ hasText: "Episódio 3 publicado:" }).waitFor();
  // Change category/mode, then reopen: the movie destination is remembered too.
  await popup.evaluate((captured) => localStorage.setItem("captureOverride", JSON.stringify({ ...captured, title: "Vídeo de outra categoria", urls: ["https://redecanais.af/player3/server.php?vid=MOVIEFAST"] })), captured);
  await popup.getByLabel("Adicionar como").selectOption("movie");
  await popup.locator('#category').selectOption({ label: "Viagens" });
  await popup.getByLabel("Publicar ao salvar").uncheck();
  await popup.reload();
  await popup.waitForFunction(() => !document.querySelector('#send').disabled);
  assert.equal(await popup.getByLabel("Adicionar como").inputValue(), 'movie');
  await popup.getByRole("button", { name: "Salvar vídeo", exact: true }).click();
  await popup.getByRole("status").filter({ hasText: "Vídeo salvo como rascunho:" }).waitFor();
  await popup.screenshot({ path: path.join(root, "backend/test-results/extension-success.png"), fullPage: true });
  // A legacy series retains its source in storage but never exposes a standalone player.
  await db.query("UPDATE videos SET source_type='external', provider_id='youtube', external_path='/embed/legacy' WHERE id=$1", [seriesId]);
  await page.goto(origin + "/video/" + seriesId);
  await page.getByRole("heading", { name: "Horizontes", exact: true, level: 1 }).waitFor();
  assert.equal(await page.locator('iframe, video').count(), 0);
  assert.equal(await page.getByRole("button", { name: "Carregar vídeo externo" }).count(), 0);
  assert.equal((await db.query("SELECT external_path FROM videos WHERE id=$1", [seriesId])).rows[0].external_path, "/embed/legacy");
  await page.goto(seriesAdminUrl);
  await page.getByRole("heading", { name: "Temporadas e episódios" }).waitFor();
  assert.equal(await page.locator('input[name=video], input[name=externalUrl]').count(), 0);
  // Revoked login must never be shown as success.
  await db.query('DELETE FROM sessions');
  await popup.getByRole("button", { name: "Salvar vídeo", exact: true }).click();
  await popup.getByRole("status").filter({ hasText: "Entre como administrador" }).waitFor();
  await popup.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, categoria, upload, HLS playback, favorito, histórico e retomada, busca, admin, vídeo externo e mudança de domínio no painel com CSP dinâmica e iframe simulado, temporadas e episódios (criação, vínculo, seleção e próximo episódio), layout 390px e alteração de senha. Extensão rápida: destino lembrado, envio direto, duplicados, próximo número, categoria e sessão expirada. Sem erros de JavaScript.",
  );
} catch (error) {
  await page
    .screenshot({
      path: path.join(root, "backend/test-results/failure.png"),
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
  await app.close();
  gateway.closeAllConnections();
  await new Promise((r) => gateway.close(r));
  await pool.end();
  await db.close();
  await rm(process.env.STORAGE_DIR, { recursive: true, force: true });
}
