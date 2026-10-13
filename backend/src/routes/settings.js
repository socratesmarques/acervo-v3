import { z } from "zod";
import { admin } from "../security.js";
import { query } from "../db.js";

export default async function settingsRoutes(app) {
  app.get("/api/settings", async () => {
    const { rows: [settings] } = await query("SELECT show_release_year FROM app_settings WHERE id=1");
    return { showReleaseYear: settings.show_release_year };
  });
  app.put("/api/admin/settings", { preHandler: admin }, async (req) => {
    const { showReleaseYear } = z.object({ showReleaseYear: z.boolean() }).strict().parse(req.body);
    await query("UPDATE app_settings SET show_release_year=$1 WHERE id=1", [showReleaseYear]);
    return { showReleaseYear };
  });
}
