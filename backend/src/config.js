import { z } from "zod";
import path from "node:path";

const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    APP_ORIGIN: z.string().url().default("http://localhost:5173"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    STORAGE_DIR: z.string().default("./storage"),
    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(102400).default(10240),
    FFMPEG_TIMEOUT_SECONDS: z.coerce.number().int().min(30).default(14400),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().default("auto"),
    S3_ENDPOINT: z.preprocess(
      (v) => (v === "" ? undefined : v),
      z.string().url().optional(),
    ),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
  })
  .parse(process.env);
if (
  env.STORAGE_DRIVER === "s3" &&
  (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY)
) {
  throw new Error(
    "Configure S3_BUCKET, S3_ACCESS_KEY_ID e S3_SECRET_ACCESS_KEY.",
  );
}
export const config = {
  ...env,
  APP_ORIGIN: new URL(env.APP_ORIGIN).origin,
  STORAGE_DIR: path.resolve(env.STORAGE_DIR),
};
