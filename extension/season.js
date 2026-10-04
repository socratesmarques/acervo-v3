// Lê o texto e os links visíveis na ordem do documento após a ação do usuário.
(() => {
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const found = new Map();
  let seasonNumber = null;
  let seasonLabel = null;
  let recentText = '';
  let sinceEpisode = 100;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(), visited = 0; node && visited < 40000; node = walker.nextNode(), visited++) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.closest('script,style,noscript,template,[hidden]')) continue;
      const part = clean(node.nodeValue);
      if (!part) continue;
      const season = (recentText + ' ' + part).match(/(?:^|\s)(\d{1,3})\s*[ªºa]?\s*temporada$/i);
      if (season) { seasonNumber = Number(season[1]); seasonLabel = null; recentText = ''; sinceEpisode = 100; continue; }
      if (/^saga\s+.{2,100}$/i.test(part)) { seasonNumber = null; seasonLabel = part; recentText = ''; sinceEpisode = 100; continue; }
      recentText = (recentText + ' ' + part).slice(-700);
      sinceEpisode++;
      if (/epis[oó]dio\s*0*\d{1,3}\b/i.test(recentText.slice(-240))) sinceEpisode = 0;
      continue;
    }
    if (node.tagName !== 'A' || !node.hasAttribute('href')) continue;
    const label = clean(node.innerText || node.textContent);
    if (!/dublad[oa]/i.test(label) || /legendad[oa]/i.test(label) || sinceEpisode > 8) continue;
    const matches = [...recentText.matchAll(/epis[oó]dio\s*0*(\d{1,3})\b/gi)];
    const match = matches.at(-1);
    if (!match) continue;
    let url;
    try { url = new URL(node.getAttribute('href'), location.href); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 2048 || url.href === location.href) continue;
    const number = Number(match[1]);
    const title = clean(recentText.slice(match.index).replace(/\s*[-–—]?\s*dublad[oa].*$/i, '').replace(/[-–—]\s*$/, '')).slice(0, 160);
    const key = (seasonLabel || seasonNumber || '?') + ':' + number;
    if (!found.has(key)) found.set(key, { url: url.href, number, seasonNumber, seasonLabel, title: title || 'Episódio ' + number, dubbed: true });
    if (found.size >= 1500) break;
  }
  return [...found.values()];
})();
