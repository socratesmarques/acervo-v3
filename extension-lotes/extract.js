// Executado apenas na página ativa, após o clique do usuário. Não faz requisições.
(() => {
  function playerUrl(raw, base = location.href, depth = 0) {
    try {
      if (!raw || raw.length > 8192 || depth > 1) return null;
      const url = new URL(raw.trim(), base);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      if (url.pathname === '/player3/embed.api') {
        const encoded = url.searchParams.get('embed');
        if (!encoded || encoded.length > 6000) return null;
        return playerUrl(atob(encoded), url.origin + '/', depth + 1);
      }
      const supported = url.pathname === '/player3/server.php' ||
        (/^(www\.)?youtube(-nocookie)?\.com$/.test(url.hostname) && /^\/embed\/[\w-]+$/.test(url.pathname)) ||
        (url.hostname === 'player.vimeo.com' && /^\/video\/\d+$/.test(url.pathname));
      if (!supported) return null;
      url.protocol = 'https:';
      return url.href.length <= 4096 ? url.href : null;
    } catch { return null; }
  }
  const urls = new Set();
  const add = raw => { const url = playerUrl(raw); if (url && urls.size < 30) urls.add(url); };
  add(location.href);
  for (const element of [...document.querySelectorAll('iframe[src], a[href]')].slice(0, 1000)) {
    add(element.getAttribute(element.tagName === 'IFRAME' ? 'src' : 'href'));
  }
  for (const element of [...document.querySelectorAll('textarea, pre, code')].slice(0, 50)) {
    const raw = (element.value ?? element.textContent ?? '').slice(0, 20000);
    // O HTML é analisado em documento inerte; nunca é inserido na página.
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    for (const iframe of parsed.querySelectorAll('iframe[src]')) add(iframe.getAttribute('src'));
  }
  const meta = selector => document.querySelector(selector)?.getAttribute('content') || '';
  const clean = value => value.replace(/\s+/g, ' ').trim()
    .replace(/\s*(?:\||–|—|-)\s*Rede\s*Canais.*$/i, '')
    .replace(/^Assistir\s+/i, '').slice(0, 160);
  const candidates = [meta('meta[property="og:title"]'), meta('meta[name="twitter:title"]'), document.querySelector('h1')?.textContent || '', document.title];
  const title = candidates.map(clean).find(value => value && !/^(embed|player|redecanais|rede canais|vídeo|video)(\s*[-|].*)?$/i.test(value)) || '';
  return { version: 1, title, description: meta('meta[property="og:description"]') || meta('meta[name="description"]'), urls: [...urls], sourcePage: location.href };
})();
