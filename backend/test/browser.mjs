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
    args: custom.args,
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
  await page.getByLabel("Tipo de conteúdo").selectOption("series");
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
  assert.equal(await page.getByLabel("Tipo de conteúdo").inputValue(), "series");
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
  assert.deepEqual(errors, []);
  console.log(
    "PASS: login, categoria, upload, HLS playback, favorito, histórico e retomada, busca, admin, vídeo externo e mudança de domínio no painel com CSP dinâmica e iframe simulado, layout 390px e alteração de senha. Sem erros de JavaScript.",
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
