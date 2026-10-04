// Lê apenas links da página atual, depois que o usuário escolhe importar a temporada.
(() => {
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const found = new Map();
  let seasonNumber = null;
  const nodes = [...document.querySelectorAll('h1,h2,h3,h4,h5,a[href]')].slice(0, 2500);
  for (const node of nodes) {
    if (node.tagName !== 'A') {
      const match = clean(node.textContent).match(/^(\d{1,3})\s*[ªºa]?\s*temporada\b/i);
      if (match) seasonNumber = Number(match[1]);
      continue;
    }
    const label = clean(node.innerText || node.textContent);
    // Se há dois links na mesma linha, use somente a opção dublada.
    if (!/dublad[oa]/i.test(label) || /legendad[oa]/i.test(label)) continue;
    let row = '';
    for (let parent = node.parentElement, depth = 0; parent && depth < 4; parent = parent.parentElement, depth++) {
      const text = clean(parent.textContent);
      if (text.length <= 300 && /epis[oó]dio\s*0*\d{1,3}\b/i.test(text)) { row = text; break; }
    }
    const match = row.match(/epis[oó]dio\s*0*(\d{1,3})\b/i);
    if (!match) continue;
    let url;
    try { url = new URL(node.getAttribute('href'), location.href); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password || url.origin !== location.origin || url.href.length > 2048 || url.href === location.href) continue;
    const number = Number(match[1]);
    const title = clean(row.replace(/\s*[-–—]?\s*dublad[oa].*$/i, '')).slice(0, 160);
    const key = (seasonNumber ?? '?') + ':' + number;
    if (!found.has(key)) found.set(key, { url: url.href, number, seasonNumber, title: title || 'Episódio ' + number, dubbed: true });
    if (found.size >= 100) break;
  }
  return [...found.values()].sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0) || a.number - b.number);
})();
