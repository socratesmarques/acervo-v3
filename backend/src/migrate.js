import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./db.js";

export async function migrate() {
  const db = await pool.connect();
  try {
    await db.query("SELECT pg_advisory_lock(830410)");
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const directory = fileURLToPath(new URL("../migrations/", import.meta.url));
    for (const name of (await readdir(directory))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      if (
        (
          await db.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await db.query("BEGIN");
      try {
        await db.query(await readFile(`${directory}/${name}`, "utf8"));
        await db.query("INSERT INTO schema_migrations(name) VALUES($1)", [
          name,
        ]);
        await db.query("COMMIT");
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await db.query("SELECT pg_advisory_unlock(830410)");
    db.release();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await migrate();
    console.log("Migrations aplicadas.");
  } finally {
    await pool.end();
  }
}
