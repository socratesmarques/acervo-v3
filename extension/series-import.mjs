// Reutiliza os resultados de movies.js (cartões) e season.js (episódios).
// Não faz requisições e nunca interpreta URLs de vídeos como páginas de séries.
export function expandSeriesSource(source, capture, limit = 120) {
  if (!source?.url || !capture) throw new Error('Página de séries inválida.');
  if (capture.kind === 'series') {
    if (!Array.isArray(capture.episodes) || !capture.episodes.length)
      throw new Error('Nenhum episódio encontrado nesta página.');
    return [{ url: source.url, title: String(source.title || capture.page?.title || '').trim().slice(0, 160),
      coverUrl: source.coverUrl || capture.page?.coverUrl || null, capture }];
  }
  if (capture.kind !== 'listing') throw new Error('Não foi possível reconhecer a listagem de séries.');
  const seen = new Set(), items = [];
  const host = new URL(source.url).origin;
  for (const item of Array.isArray(capture.entries) ? capture.entries : []) {
    try {
      const url = new URL(item.url), title = String(item.title || '').trim().slice(0, 160);
      url.hash = '';
      if (url.protocol !== 'https:' || url.origin !== host || url.username || url.password ||
          url.href.length > 2048 || title.length < 4 || seen.has(url.href)) continue;
      seen.add(url.href);
      items.push({ url: url.href, title, coverUrl: item.coverUrl || null });
      if (items.length >= limit) break;
    } catch {}
  }
  if (!items.length) throw new Error('Nenhuma série encontrada. Confira os cartões e links visíveis.');
  return items;
}

export function normalizeSeriesEpisodes(entries, maxEpisodes = 500) {
  const valid = [];
  for (const raw of Array.isArray(entries) ? entries : []) {
    try {
      const url = new URL(raw.url);
      const number = Number(raw.number);
      if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048 ||
        !Number.isInteger(number) || number < 1 || number > 10000 || raw.dubbed !== true) continue;
      url.hash = '';
      const seasonNumber = raw.seasonNumber === null || raw.seasonNumber === undefined ? null : Number(raw.seasonNumber);
      if (seasonNumber !== null && (!Number.isInteger(seasonNumber) || seasonNumber < 1 || seasonNumber > 1000)) continue;
      valid.push({ url: url.href, number, seasonNumber, seasonLabel: String(raw.seasonLabel || '').trim().slice(0,160),
        title: String(raw.title || 'Episódio ' + number).trim().slice(0,160) });
    } catch {}
  }
  const explicit = new Set(valid.map(e => e.seasonNumber).filter(n => n !== null));
  const labels = new Map();
  let next = 1;
  const seen = new Set(), episodes = [];
  for (const item of valid) {
    let number = item.seasonNumber;
    if (number === null && !item.seasonLabel) number = 1;
    if (number === null) {
      const key = item.seasonLabel;
      if (!labels.has(key)) {
        while (explicit.has(next) || [...labels.values()].includes(next)) next++;
        if (next > 1000) break;
        labels.set(key, next++);
      }
      number = labels.get(key);
    }
    const key = number + ':' + item.number;
    if (seen.has(key)) continue;
    seen.add(key);
    episodes.push({ url: item.url, title: item.title || 'Episódio ' + item.number,
      number: item.number, seasonNumber: number, seasonTitle: item.seasonLabel || '' });
    if (episodes.length >= maxEpisodes) break;
  }
  return episodes;
}
