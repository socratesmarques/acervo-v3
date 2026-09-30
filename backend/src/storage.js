import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, copyFile, stat, readdir, rm, rename } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { config } from "./config.js";
export const mediaRoot = path.join(config.STORAGE_DIR, "media");
export const spoolRoot = path.join(config.STORAGE_DIR, "spool");
let client;
function s3() {
  if (!client)
    client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  return client;
}
export function mime(key) {
  return (
    {
      ".m3u8": "application/vnd.apple.mpegurl",
      ".ts": "video/mp2t",
      ".mp4": "video/mp4",
      ".jpg": "image/jpeg",
    }[path.extname(key)] || "application/octet-stream"
  );
}
export async function putFile(driver, key, source) {
  if (driver === "local") {
    const target = path.join(mediaRoot, key);
    await mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await copyFile(source, temp);
      await rename(temp, target);
    } finally {
      await rm(temp, { force: true });
    }
  } else {
    await new Upload({
      client: s3(),
      queueSize: 2,
      partSize: 10 * 1024 * 1024,
      params: {
        Bucket: config.S3_BUCKET,
        Key: key,
        Body: createReadStream(source),
        ContentLength: (await stat(source)).size,
        ContentType: mime(key),
      },
    }).done();
  }
}
export async function putDirectory(driver, id, directory) {
  // Sequential, bounded memory; segments and variants first, master playlist last.
  const files = await readdir(directory, { recursive: true });
  for (const file of files.sort(
    (a, b) => (a === "master.m3u8") - (b === "master.m3u8"),
  )) {
    const source = path.join(directory, file);
    if ((await stat(source)).isFile())
      await putFile(driver, `${id}/${file.split(path.sep).join("/")}`, source);
  }
}
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2])) return false;
  let start = match[1]
    ? Number(match[1])
    : Math.max(0, size - Number(match[2]));
  let end = match[1]
    ? match[2]
      ? Math.min(Number(match[2]), size - 1)
      : size - 1
    : size - 1;
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  )
    return false;
  return { start, end };
}
export async function sendMedia(reply, req, driver, key) {
  reply
    .header("Cache-Control", "private, no-store")
    .type(mime(key))
    .header("Accept-Ranges", "bytes");
  if (driver === "s3") {
    if (req.headers.range && !/^bytes=(\d*)-(\d*)$/.test(req.headers.range))
      return reply.code(416).send();
    const result = await s3().send(
      new GetObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
        Range: req.headers.range,
      }),
    );
    if (result.ContentRange)
      reply.code(206).header("Content-Range", result.ContentRange);
    reply.header("Content-Length", result.ContentLength);
    return reply.send(result.Body);
  }
  const file = path.join(mediaRoot, key),
    size = (await stat(file)).size;
  const range = parseRange(req.headers.range, size);
  if (range === false)
    return reply.code(416).header("Content-Range", `bytes */${size}`).send();
  if (range)
    reply
      .code(206)
      .header("Content-Range", `bytes ${range.start}-${range.end}/${size}`)
      .header("Content-Length", range.end - range.start + 1);
  else reply.header("Content-Length", size);
  return reply.send(createReadStream(file, range || {}));
}
export async function deleteMedia(driver, id) {
  if (driver === "local")
    await rm(path.join(mediaRoot, id), { recursive: true, force: true });
  else {
    let token;
    do {
      const result = await s3().send(
        new ListObjectsV2Command({
          Bucket: config.S3_BUCKET,
          Prefix: `${id}/`,
          ContinuationToken: token,
        }),
      );
      if (result.Contents?.length) {
        const deleted = await s3().send(
          new DeleteObjectsCommand({
            Bucket: config.S3_BUCKET,
            Delete: { Objects: result.Contents.map(({ Key }) => ({ Key })) },
          }),
        );
        if (deleted.Errors?.length)
          throw new Error("Falha ao excluir objetos S3.");
      }
      token = result.NextContinuationToken;
    } while (token);
  }
  await rm(path.join(spoolRoot, id), { recursive: true, force: true });
}
