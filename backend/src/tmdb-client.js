// Sanitização e representação dos resultados do TMDB.
export function normalizeMovieTitle(value) {
  return String(value || '')
    .replace(/\([^)]*(?:dublad[oa]|legendad[oa]|dual\s*audio|1080p|720p|4k|bluray|web-dl)[^)]*\)/gi, ' ')
    .replace(/\b(?:dublad[oa]|legendad[oa]|dual\s*audio|1080p|720p|2160p|4k|bluray|web-dl)\b/gi, ' ')
    .replace(/\s*[-–—|]\s*(?:19\d\d|20\d\d)(?:\s*[-–—|].*)?$/i, '')
    .replace(/\s*\((?:19\d\d|20\d\d)\)\s*$/i, '')
    .replace(/\s*[-–—|]\s*$/g, '').replace(/\s+/g, ' ').trim().slice(0, 160);
}
export function yearSuggestion(value, explicitYear) {
  if (Number.isInteger(explicitYear) && explicitYear >= 1888 && explicitYear <= 2100) return explicitYear;
  const years = String(value || '').match(/\b(?:19|20)\d{2}\b/g);
  return years?.length ? Number(years.at(-1)) : null;
}
export function tmdbPosterUrl(filePath) {
  if (typeof filePath !== 'string' || !/^\/[A-Za-z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(filePath)) return null;
  return 'https://image.tmdb.org/t/p/w500' + filePath;
}
export function mapMovie(movie) {
  const posterUrl = tmdbPosterUrl(movie?.poster_path);
  if (!Number.isSafeInteger(movie?.id) || movie.id <= 0 || !posterUrl) return null;
  const year = Number(String(movie.release_date || '').slice(0, 4));
  return {
    id: movie.id, title: String(movie.title || '').slice(0, 160),
    originalTitle: String(movie.original_title || '').slice(0, 160),
    year: Number.isInteger(year) && year >= 1888 && year <= 2100 ? year : null,
    overview: String(movie.overview || '').slice(0, 500), posterUrl
  };
}
