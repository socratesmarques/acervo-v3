import { access, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";
const target = fileURLToPath(new URL("../.env", import.meta.url));
try {
  await access(target);
  console.error(
    "Já existe .env. Ele foi preservado. Edite-o para alterar a configuração.",
  );
  process.exit(1);
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const rl = createInterface({ input: stdin, output: stdout });
const name = (await rl.question("Seu nome [Sócrates]: ")).trim() || "Sócrates";
const email =
  (
    await rl.question("E-mail do administrador [admin@acervo.local]: ")
  ).trim() || "admin@acervo.local";
rl.close();
if (
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  name.length < 2 ||
  name.length > 100 ||
  /[\r\n]/.test(name + email)
)
  throw new Error("Nome ou e-mail inválido.");
const password = randomBytes(18).toString("base64url");
await writeFile(
  target,
  `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\nADMIN_NAME=${JSON.stringify(name)}\nADMIN_EMAIL=${JSON.stringify(email)}\nADMIN_PASSWORD=${password}\nAPP_ORIGIN=http://localhost:8080\nWEB_PORT=8080\nBIND_ADDRESS=127.0.0.1\nCOOKIE_SECURE=false\nSTORAGE_DRIVER=local\nMAX_UPLOAD_MB=10240\nFFMPEG_TIMEOUT_SECONDS=14400\nS3_REGION=auto\n`,
  { mode: 0o600, flag: "wx" },
);
console.log("\nConfiguração criada. Guarde estas credenciais iniciais:");
console.log("E-mail:", email);
console.log("Senha:", password);
console.log("\nPróximo comando: docker compose up -d --build");
