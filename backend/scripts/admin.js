import { z } from "zod";
import { createUser } from "../src/security.js";
import { pool } from "../src/db.js";
try {
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
  console.log("Administrador criado. A senha não foi exibida.");
} finally {
  await pool.end();
}
