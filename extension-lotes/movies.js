// ACERVO V2: lê somente os links presentes na página aberta; não navega por catálogos.
(() => {
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim()
    .replace(/^\s*(?:assistir(?: online)?|ver)\s+/i, '')
    .replace(/\s*[-|–—]\s*rede\s*canais.*$/i, '');
  const ignored = /^(?:home|in[ií]cio|filmes?|s[eé]ries?|animes?|categorias?|g[eê]neros?|busca(?:r)?|pesquisa(?:r)?|menu|entrar|login|cadastro|pr[oó]xim[oa]|anterior|voltar|data|ordem|ordenar|filtrar|p[aá]gina\s*\d+|dublad[oa]|legendad[oa]|assistir|ver|player|trailer|\d+)$/i;
  const seen = new Set(), entries = [];
  for (const link of [...document.querySelectorAll('a[href]')].slice(0, 4000)) {
    if (entries.length >= 120) break;
    if (link.closest('header,footer,nav,[role="navigation"]') || link.getClientRects().length === 0) continue;
    let url;
    try { url = new URL(link.getAttribute('href'), location.href); } catch { continue; }
    if (url.protocol !== 'https:' || url.origin !== location.origin || url.username || url.password ||
        url.href.length > 2048 || url.href === location.href || seen.has(url.href) ||
        /\/(?:player3\/|login|logout|admin)(?:\/|$)/i.test(url.pathname) ||
        /\/(?:browse|search|categoria|category|genre|genero|tag)(?:[-\/]|$)/i.test(url.pathname)) continue;
    const card = link.closest('article,li,[class*="card"],[class*="item"]');
    const choices = [link.querySelector('img[alt]')?.getAttribute('alt'), link.getAttribute('title'),
      link.getAttribute('aria-label'), link.querySelector('h2,h3,h4')?.textContent,
      card?.querySelector('h2,h3,h4')?.textContent, link.textContent];
    const title = choices.map(clean).find((s) => s.length >= 4 && s.length <= 160 && !ignored.test(s));
    if (!title || /^https?:/i.test(title)) continue;
    seen.add(url.href); entries.push({ title, url: url.href });
  }
  return entries;
})();
