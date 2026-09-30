import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { query } from "./db.js";
import { config } from "./config.js";
const scrypt = promisify(scryptCallback);
export const uuid = z.string().uuid();
export const hashToken = (value) =>
  createHash("sha256").update(value).digest("hex");
export const cookieOptions = {
  path: "/api",
  httpOnly: true,
  secure: config.COOKIE_SECURE === "true",
  sameSite: "strict",
  maxAge: 7 * 86400,
};
export function fail(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  const [salt, key] = stored.split(":");
  const computed = await scrypt(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return (
    computed.length === expected.length && timingSafeEqual(computed, expected)
  );
}
const dummyHash = await hashPassword(randomBytes(32).toString("hex"));
export async function login(email, password) {
  const {
    rows: [user],
  } = await query("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
  if (
    !(await verifyPassword(password, user?.password_hash || dummyHash)) ||
    !user
  )
    fail(401, "E-mail ou senha incorretos.");
  const token = randomBytes(32).toString("hex"),
    csrf = randomBytes(32).toString("hex");
  await query("DELETE FROM sessions WHERE expires_at < now()");
  await query(
    "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '7 days')",
    [hashToken(token), user.id, csrf],
  );
  return { token, csrf, user: publicUser(user) };
}
export const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
});
export async function authenticate(req) {
  const token = req.cookies.acervo_session;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    fail(401, "Entre na sua conta para continuar.");
  const {
    rows: [session],
  } = await query(
    "SELECT u.*,s.csrf_token,s.token_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()",
    [hashToken(token)],
  );
  if (!session) fail(401, "Sua sessão expirou. Entre novamente.");
  req.user = publicUser(session);
  req.session = session;
}
export function checkOrigin(req) {
  if (req.headers.origin !== config.APP_ORIGIN)
    fail(403, "Origem da requisição não autorizada.");
}
export function checkCsrf(req) {
  const actual = req.headers["x-csrf-token"] || "";
  const expected = req.session.csrf_token;
  if (
    typeof actual !== "string" ||
    !/^[a-f0-9]{64}$/.test(actual) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    fail(403, "Token de segurança inválido. Atualize a página.");
}
export async function admin(req) {
  if (req.user.role !== "admin")
    fail(403, "Acesso exclusivo do administrador.");
}
export async function createUser({ name, email, password, role = "viewer" }) {
  const id = randomUUID();
  await query(
    "INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5)",
    [id, name, email.toLowerCase(), await hashPassword(password), role],
  );
  return { id, name, email: email.toLowerCase(), role };
}
