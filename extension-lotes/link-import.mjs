// Transforma uma URL fornecida em filmes candidatos, sem criar outro detector.
// A detecção em páginas de catálogo continua sendo feita por movies.js.
export function expandMovieSource(source, capture, maxMovies = 120) {
  if (!source?.url || !capture || !['movie', 'listing'].includes(capture.kind))
    throw new Error('A página não retornou uma lista de filmes válida.');
  if (capture.kind === 'movie') {
    if (!Array.isArray(capture.page?.urls) || !capture.page.urls.length)
      throw new Error('Player compatível não encontrado na página.');
    return [{ kind: 'movie', url: source.url, title: (source.title || capture.page.title || '').trim().slice(0, 160),
      coverUrl: capture.page.coverUrl || null, page: capture.page }];
  }
  const origin = new URL(source.url).origin, seen = new Set(), entries = [];
  for (const candidate of Array.isArray(capture.entries) ? capture.entries : []) {
    try {
      const url = new URL(candidate.url);
      const title = String(candidate.title || '').trim().slice(0, 160);
      // movies.js só identifica links da mesma origem. Revalidar na fronteira.
      if (url.protocol !== 'https:' || url.origin !== origin || url.username || url.password ||
          url.href.length > 2048 || title.length < 4) continue;
      url.hash = '';
      if (seen.has(url.href)) continue;
      seen.add(url.href);
      entries.push({ kind: 'movie', url: url.href, title, coverUrl: candidate.coverUrl || null });
      if (entries.length >= maxMovies) break;
    } catch {}
  }
  if (!entries.length) throw new Error('Nenhum link de filme foi encontrado. Abra uma página com filmes listados e títulos visíveis.');
  return entries;
}
