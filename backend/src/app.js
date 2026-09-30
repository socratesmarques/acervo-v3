import Fastify from "fastify";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { ZodError } from "zod";
import { config } from "./config.js";
import { authenticate, checkCsrf, checkOrigin } from "./security.js";
import { query } from "./db.js";
import authRoutes from "./routes/auth.js";
import providerRoutes from "./routes/providers.js";
import videoRoutes from "./routes/videos.js";
import libraryRoutes from "./routes/library.js";
export async function buildApp({ logger = true } = {}) {
  const app = Fastify({
    logger: logger
      ? {
          redact: [
            "req.headers.cookie",
            "req.headers.authorization",
            "req.headers.x-csrf-token",
          ],
        }
      : false,
    bodyLimit: 128 * 1024,
    trustProxy: config.TRUST_PROXY === "true",
    requestTimeout: 2 * 60 * 60 * 1000,
  });
  await app.register(cookie);
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: "same-origin" },
  });
  await app.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: "1 minute",
  });
  await app.register(multipart);
  app.decorateRequest("user", null);
  app.decorateRequest("session", null);
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) checkOrigin(req);
    if (!req.routeOptions.config.public) {
      await authenticate(req);
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) checkCsrf(req);
    }
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply
        .code(400)
        .send({
          message: "Revise os campos enviados.",
          issues: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        });
    if (error.code === "23505")
      return reply
        .code(409)
        .send({ message: "Já existe um registro com esse nome ou e-mail." });
    if (["23503", "23001"].includes(error.code))
      return reply
        .code(409)
        .send({
          message:
            "Categoria inexistente ou ainda usada por vídeos. Verifique os vínculos.",
        });
    if (["ENOENT", "NoSuchKey", "NotFound"].includes(error.code || error.name))
      return reply.code(404).send({ message: "Arquivo não encontrado." });
    if (error.name === "InvalidRange")
      return reply.code(416).send({ message: "Intervalo de vídeo inválido." });
    const status = error.statusCode || 500;
    if (status >= 500) req.log.error({ err: error }, "Falha na requisição");
    reply
      .code(status)
      .send({
        message:
          status >= 500 ? "Erro interno. Tente novamente." : error.message,
      });
  });
  app.get("/api/health", { config: { public: true } }, async () => {
    await query("SELECT 1");
    return { ok: true };
  });
  await app.register(authRoutes);
  await app.register(videoRoutes);
  await app.register(providerRoutes);
  await app.register(libraryRoutes);
  return app;
}
