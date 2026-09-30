import { migrate } from "../src/migrate.js";
import { pool, query } from "../src/db.js";
import { createUser } from "../src/security.js";
import { z } from "zod";
try {
  await migrate();
  const {
    rows: [{ total }],
  } = await query(
    "SELECT count(*)::int AS total FROM users WHERE role='admin'",
  );
  if (total === 0) {
    const data = z
      .object({
        ADMIN_NAME: z.string().min(2).default("Sócrates"),
        ADMIN_EMAIL: z.string().email(),
        ADMIN_PASSWORD: z.string().min(12).max(200),
      })
      .parse(process.env);
    await createUser({
      name: data.ADMIN_NAME,
      email: data.ADMIN_EMAIL,
      password: data.ADMIN_PASSWORD,
      role: "admin",
    });
    console.log("Administrador inicial criado.");
  } else console.log("Administrador já existe; senha preservada.");
} finally {
  await pool.end();
}
