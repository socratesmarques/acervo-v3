import { buildApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
const app = await buildApp();
await app.listen({ port: config.PORT, host: "0.0.0.0" });
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    process.exit(0);
  });
