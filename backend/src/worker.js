import path from "node:path";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, rm } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pool } from "./db.js";
import { spoolRoot, putDirectory, putFile, deleteMedia } from "./storage.js";
import { transcode } from "./media.js";
import { fileURLToPath } from "node:url";
export async function processOne(db) {
  const {
    rows: [video],
  } = await db.query(
    "UPDATE videos SET status='processing',processing_started_at=now(),processing_error=NULL,updated_at=now() WHERE id=(SELECT id FROM videos WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *",
  );
  if (!video) return false;
  const directory = path.join(spoolRoot, video.id),
    out = path.join(directory, `output-${randomUUID()}`);
  try {
    await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
    if (video.custom_thumbnail)
      await copyFile(
        path.join(directory, "thumbnail.jpg"),
        path.join(out, "thumbnail.jpg"),
      );
    const result = await transcode(
      path.join(directory, "source"),
      out,
      video.custom_thumbnail,
    );
    await putDirectory(video.storage_driver, video.id, out);
    await putFile(
      video.storage_driver,
      `${video.id}/original`,
      path.join(directory, "source"),
    );
    await db.query(
      "UPDATE videos SET status='ready',duration=$2,qualities=$3,published_at=CASE WHEN published THEN COALESCE(published_at,now()) ELSE published_at END,updated_at=now() WHERE id=$1",
      [video.id, result.duration, JSON.stringify(result.qualities)],
    );
    await rm(directory, { recursive: true, force: true }).catch((error) => {
      // A temporary-file cleanup failure must not invalidate a published video.
      console.warn(`Limpeza temporária pendente para ${video.id}:`, error.message);
    });
    console.log(`Vídeo ${video.id} pronto.`);
  } catch (error) {
    console.error(`Processamento de ${video.id}:`, error.message);
    await db.query(
      "UPDATE videos SET status='failed',processing_error=$2,updated_at=now() WHERE id=$1",
      [
        video.id,
        "Não foi possível processar. Confira os logs do worker e tente novamente.",
      ],
    );
  }
  return true;
}
export async function collectGarbage(db) {
  for (const item of (
    await db.query("SELECT * FROM media_gc ORDER BY created_at LIMIT 20")
  ).rows) {
    try {
      await deleteMedia(item.storage_driver, item.id);
      await db.query("DELETE FROM media_gc WHERE id=$1", [item.id]);
    } catch (error) {
      console.error("Limpeza pendente:", item.id, error.message);
    }
  }
}
export async function worker() {
  const db = await pool.connect();
  // A session-level lock prevents duplicate workers. PostgreSQL releases it on crash.
  const {
    rows: [{ locked }],
  } = await db.query("SELECT pg_try_advisory_lock(830411) AS locked");
  if (!locked) {
    db.release();
    throw new Error("Já existe um worker ativo.");
  }
  db.on("error", () => process.exit(1));
  let stopping = false;
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      stopping = true;
    });
  await db.query("UPDATE videos SET status='queued' WHERE status='processing'");
  while (!stopping) {
    await collectGarbage(db);
    if (!(await processOne(db))) await delay(2000);
  }
  await db.query("SELECT pg_advisory_unlock(830411)");
  db.release();
  await pool.end();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await worker();
