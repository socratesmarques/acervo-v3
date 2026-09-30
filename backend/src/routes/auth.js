import { z } from "zod";
import {
  login,
  cookieOptions,
  publicUser,
  createUser,
  admin,
  verifyPassword,
  hashPassword,
  fail,
} from "../security.js";
import { query, transaction } from "../db.js";
const credentials = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    password: z.string().min(1).max(200),
  })
  .strict();
export default async function authRoutes(app) {
  app.post(
    "/api/auth/login",
    {
      config: { public: true, rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const data = credentials.parse(req.body),
        result = await login(data.email, data.password);
      reply.setCookie("acervo_session", result.token, cookieOptions);
      return { user: result.user, csrf: result.csrf };
    },
  );
  app.get("/api/auth/me", async (req) => ({
    user: req.user,
    csrf: req.session.csrf_token,
  }));
  app.post("/api/auth/logout", async (req, reply) => {
    await query("DELETE FROM sessions WHERE token_hash=$1", [
      req.session.token_hash,
    ]);
    reply.clearCookie("acervo_session", { path: "/api" });
    return { ok: true };
  });
  app.put("/api/auth/password", async (req, reply) => {
    const data = z
      .object({
        currentPassword: z.string().min(1).max(200),
        newPassword: z.string().min(12).max(200),
      })
      .strict()
      .parse(req.body);
    const {
      rows: [user],
    } = await query("SELECT password_hash FROM users WHERE id=$1", [
      req.user.id,
    ]);
    if (!(await verifyPassword(data.currentPassword, user.password_hash)))
      fail(400, "Senha atual incorreta.");
    const hash = await hashPassword(data.newPassword);
    await transaction(async (db) => {
      await db.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
        hash,
        req.user.id,
      ]);
      await db.query("DELETE FROM sessions WHERE user_id=$1", [req.user.id]);
    });
    reply.clearCookie("acervo_session", { path: "/api" });
    return { ok: true };
  });
  app.get("/api/admin/users", { preHandler: admin }, async () => ({
    items: (
      await query(
        "SELECT id,name,email,role FROM users ORDER BY created_at DESC",
      )
    ).rows.map(publicUser),
  }));
  app.post("/api/admin/users", { preHandler: admin }, async (req, reply) => {
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().email().max(254),
        password: z.string().min(12).max(200),
        role: z.enum(["admin", "viewer"]).default("viewer"),
      })
      .strict()
      .parse(req.body);
    return reply.code(201).send(await createUser(data));
  });
}
