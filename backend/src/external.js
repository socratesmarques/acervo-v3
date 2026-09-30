import { z } from "zod";
import { query } from "./db.js";
import { config } from "./config.js";
import { fail } from "./security.js";

function parsePublicHttps(value) {
  const url = new URL(value);
  const host = url.hostname;
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.origin === config.APP_ORIGIN || host.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host))
    throw new Error("Domínio inválido");
  return url;
}
export const providerOrigin = z.string().trim().max(300).transform((value, ctx) => {
  try {
    const url = parsePublicHttps(value);
    if (url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url.origin;
  } catch {
    ctx.addIssue({ code: "custom", message: "Informe somente um domínio HTTPS público, sem caminho, porta, parâmetros ou credenciais." });
    return z.NEVER;
  }
});
export const externalUrl = z.string().trim().max(4096).transform((value, ctx) => {
  try { return parsePublicHttps(value).href; }
  catch {
    ctx.addIssue({ code: "custom", message: "Cole somente a URL HTTPS do src do iframe, de um provedor cadastrado." });
    return z.NEVER;
  }
});
export function validatePath(kind, path) {
  if (!path || !path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path))
    fail(400, "Caminho de incorporação inválido.");
  const url = new URL(path, "https://validation.example");
  const valid = kind === "youtube" ? /^\/embed\/[a-zA-Z0-9_-]+$/.test(url.pathname)
    : kind === "vimeo" ? /^\/video\/\d+$/.test(url.pathname)
    : kind === "redecanais" && url.pathname === "/player3/server.php";
  if (!valid) fail(400, "Use a URL de incorporação do provedor, não uma página comum ou link encurtado.");
}
export async function resolveExternal(value) {
  const url = new URL(externalUrl.parse(value));
  const { rows: [provider] } = await query(
    "SELECT p.* FROM providers p JOIN provider_origins o ON o.provider_id=p.id WHERE o.origin=$1", [url.origin]);
  if (!provider) fail(400, "Domínio não cadastrado. Atualize o endereço em Admin → Provedores.");
  const externalPath = url.pathname + url.search + url.hash;
  validatePath(provider.kind, externalPath);
  return { providerId: provider.id, externalPath };
}
export function playbackUrl(video) {
  if (video.source_type !== "external") return null;
  const origin = providerOrigin.parse(video.provider_origin);
  validatePath(video.provider_kind, video.external_path);
  return origin + video.external_path;
}
