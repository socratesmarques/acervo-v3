// Lê apenas links visíveis na página da temporada após ação do usuário.
(() => {
  const found = new Map();
  for (const a of [...document.querySelectorAll('a[href]')].slice(0, 1500)) {
    const label = (a.innerText || a.textContent || '').replace(/\s+/g, ' ').trim();
    const context = (a.closest('li, article, tr, .episode, .episodio')?.textContent || label).replace(/\s+/g, ' ').trim().slice(0, 350);
    const match = (label + ' ' + context).match(/(?:epis[oó]dio|ep\.?|e)\s*0*(\d{1,3})\b/i);
    if (!match || /legendad[oa]/i.test(context) && !/dublad[oa]/i.test(context)) continue;
    let url;
    try { url = new URL(a.getAttribute('href'), location.href); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.origin !== location.origin || url.href.length > 2048) continue;
    if (url.href === location.href || found.has(url.href)) continue;
    found.set(url.href, { url: url.href, number: Number(match[1]), title: label || 'Episódio ' + match[1], dubbed: /dublad[oa]/i.test(context) });
    if (found.size >= 100) break;
  }
  return [...found.values()].sort((a, b) => a.number - b.number || Number(b.dubbed) - Number(a.dubbed));
})();
