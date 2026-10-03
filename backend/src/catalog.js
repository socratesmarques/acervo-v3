import { query } from "./db.js";
import { playbackUrl } from "./external.js";
import { fail } from "./security.js";
export const selectVideo = `SELECT v.*,c.name AS category,p.base_url AS provider_origin,p.kind AS provider_kind,p.name AS provider_name,
 s.series_id,s.number AS season_number,series.title AS series_title,
 COALESCE(h.position,0) AS position,COALESCE(h.completed,false) AS completed,
 (f.video_id IS NOT NULL) AS favorite FROM videos v
 JOIN categories c ON c.id=v.category_id
 LEFT JOIN seasons s ON s.id=v.season_id
 LEFT JOIN videos series ON series.id=s.series_id
 LEFT JOIN providers p ON p.id=v.provider_id
 LEFT JOIN watch_history h ON h.video_id=v.id AND h.user_id=$1
 LEFT JOIN favorites f ON f.video_id=v.id AND f.user_id=$1`;
export const visibleVideo = "v.published AND v.status='ready' AND (v.season_id IS NULL OR (series.published AND series.status='ready'))";
export function dto(v) {
  return {
    id: v.id,
    sourceType: v.source_type,
    contentType: v.content_type,
    seasonId: v.season_id,
    seasonNumber: v.season_number,
    episodeNumber: v.episode_number,
    seriesId: v.series_id,
    seriesTitle: v.series_title,
    externalUrl: playbackUrl(v),
    providerId: v.provider_id,
    providerName: v.provider_name,
    playerUrl: v.source_type === "external" ? `/api/players/${v.id}` : null,
    title: v.title,
    description: v.description,
    categoryId: v.category_id,
    category: v.category,
    duration: v.duration,
    published: v.published,
    status: v.status,
    processingError: v.processing_error,
    publishedAt: v.published_at || v.created_at,
    createdAt: v.created_at,
    views: Number(v.views),
    thumbnail:
      v.status === "ready" && (v.source_type === "upload" || v.custom_thumbnail)
        ? `/api/media/${v.id}/thumbnail.jpg?v=${new Date(v.updated_at).getTime()}`
        : "/placeholder-video.svg",
    source: v.status === "ready" && v.source_type === "upload" ? `/api/media/${v.id}/master.m3u8` : null,
    mp4Url: v.status === "ready" && v.source_type === "upload" ? `/api/media/${v.id}/playback.mp4` : null,
    qualities: v.qualities,
    position: Number(v.position || 0),
    completed: v.completed,
    progress: v.duration
      ? Math.min(100, Math.round(((v.position || 0) / v.duration) * 100))
      : 0,
    favorite: !!v.favorite,
  };
}
export async function accessibleVideo(id, user) {
  const {
    rows: [video],
  } = await query(
    `${selectVideo} WHERE v.id=$2 AND ($3 OR (${visibleVideo}))`,
    [user.id, id, user.role === "admin"],
  );
  if (!video) fail(404, "Vídeo não encontrado.");
  return video;
}
export async function listVideos(user, filter, adminMode = false) {
  const values = [user.id];
  const bind = (v) => {
    values.push(v);
    return `$${values.length}`;
  };
  const conditions = adminMode
    ? ["TRUE"]
    : [visibleVideo];
  if (!filter.kind) conditions.push("v.season_id IS NULL");
  if (filter.contentType === "series")
    conditions.push("v.content_type IN ('series','episode')");
  else if (filter.contentType)
    conditions.push(`v.content_type=${bind(filter.contentType)}`);
  if (filter.category)
    conditions.push(`v.category_id=${bind(filter.category)}`);
  if (filter.q) {
    const text = filter.q
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[\\%_]/g, "\\$&");
    conditions.push(
      `translate(lower(v.title || ' ' || v.description || ' ' || c.name),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') ILIKE ${bind("%" + text + "%")}`,
    );
  }
  if (filter.kind === "favorites") conditions.push("f.video_id IS NOT NULL");
  if (filter.kind === "history")
    conditions.push(
      "h.video_id IS NOT NULL AND h.position > 0 AND NOT h.completed",
    );
  const order =
    filter.kind === "history"
      ? "h.updated_at DESC"
      : filter.sort === "popular"
        ? "v.views DESC,v.created_at DESC"
        : "v.created_at DESC";
  const where = ` WHERE ${conditions.join(" AND ")}`;
  const countSql = `SELECT count(*)::int AS total FROM (${selectVideo}${where}) catalog`;
  const {
    rows: [{ total }],
  } = await query(countSql, values);
  const limit = bind(filter.limit),
    offset = bind(filter.offset);
  const { rows } = await query(
    `${selectVideo}${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  return {
    items: rows.map(dto),
    total,
    limit: filter.limit,
    offset: filter.offset,
  };
}
