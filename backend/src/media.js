import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
export function run(
  command,
  args,
  timeout = config.FFMPEG_TIMEOUT_SECONDS * 1000,
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "",
      stderr = "",
      expired = false;
    const timer = setTimeout(() => {
      expired = true;
      child.kill("SIGKILL");
    }, timeout);
    child.stdout.on("data", (b) => {
      stdout = (stdout + b).slice(-1024 * 1024);
    });
    child.stderr.on("data", (b) => {
      stderr = (stderr + b).slice(-8000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(stdout)
        : reject(
            new Error(
              expired
                ? "Processamento excedeu o tempo limite."
                : `${command} falhou: ${stderr.slice(-1500)}`,
            ),
          );
    });
  });
}
export async function probe(file) {
  const result = JSON.parse(
    await run(
      "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        file,
      ],
      30000,
    ),
  );
  const video = result.streams?.find(
    (s) => s.codec_type === "video" && !s.disposition?.attached_pic,
  );
  const duration = Number(result.format?.duration);
  if (
    !/(mov|matroska|webm|avi)/.test(result.format?.format_name || "") ||
    !video ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 43200 ||
    !video.width ||
    !video.height ||
    video.width > 8192 ||
    video.height > 8192
  )
    throw new Error(
      "Vídeo inválido: máximo de 12 horas e 8192 pixels por dimensão.",
    );
  return { width: video.width, height: video.height, duration };
}
export async function transcode(source, out, customThumbnail = false) {
  const info = await probe(source);
  await mkdir(out, { recursive: true });
  const common = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-protocol_whitelist",
    "file,pipe",
    "-i",
    source,
  ];
  // Normalized MP4 supplies a broadly compatible fallback and the original resolution.
  await run("ffmpeg", [
    ...common,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-sn",
    "-dn",
    "-vf",
    "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    "2",
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    path.join(out, "playback.mp4"),
  ]);
  const normalized = await probe(path.join(out, "playback.mp4"));
  const heights = [480, 720, 1080].filter((h) => h <= normalized.height);
  if (!heights.length)
    heights.push(Math.max(2, Math.floor(normalized.height / 2) * 2));
  const qualities = [];
  for (const height of heights) {
    const folder = path.join(out, String(height));
    await mkdir(folder, { recursive: true });
    const bitrate = height >= 1080 ? 5000 : height >= 720 ? 2800 : 1400;
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      path.join(out, "playback.mp4"),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      `scale=-2:${height}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-b:v",
      `${bitrate}k`,
      "-maxrate",
      `${bitrate}k`,
      "-bufsize",
      `${bitrate * 2}k`,
      "-threads",
      "2",
      "-force_key_frames",
      "expr:gte(t,n_forced*4)",
      "-sc_threshold",
      "0",
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-b:a",
      "128k",
      "-f",
      "hls",
      "-hls_time",
      "4",
      "-hls_playlist_type",
      "vod",
      "-hls_flags",
      "independent_segments",
      "-hls_segment_filename",
      path.join(folder, "segment-%05d.ts"),
      path.join(folder, "index.m3u8"),
    ]);
    const width =
      Math.round(((normalized.width / normalized.height) * height) / 2) * 2;
    qualities.push({ height, width, bandwidth: (bitrate + 128) * 1100 });
  }
  await writeFile(
    path.join(out, "master.m3u8"),
    "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n" +
      qualities
        .map(
          (q) =>
            `#EXT-X-STREAM-INF:BANDWIDTH=${q.bandwidth},RESOLUTION=${q.width}x${q.height}\n${q.height}/index.m3u8\n`,
        )
        .join(""),
  );
  if (!customThumbnail)
    await run(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-y",
        "-ss",
        String(Math.min(1, info.duration / 2)),
        "-i",
        path.join(out, "playback.mp4"),
        "-frames:v",
        "1",
        "-vf",
        "scale=960:-2",
        "-threads",
        "2",
        path.join(out, "thumbnail.jpg"),
      ],
      30000,
    );
  return { duration: normalized.duration, qualities };
}
