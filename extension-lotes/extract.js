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
      const blogger = url.hostname === 'www.blogger.com' && url.pathname === '/video.g' &&
        url.protocol === 'https:' && !url.port &&
        url.searchParams.getAll('token').length === 1 &&
        Boolean(url.searchParams.get('token')?.trim()) &&
        !/[\s\u0000-\u001f\u007f]/.test(url.searchParams.get('token'));
      const supported = blogger || url.pathname === '/player3/server.php' ||
        (/^(www\.)?youtube(-nocookie)?\.com$/.test(url.hostname) && /^\/embed\/[\w-]+$/.test(url.pathname)) ||
        (url.hostname === 'player.vimeo.com' && /^\/video\/\d+$/.test(url.pathname));
      if (!supported) return null;
      url.protocol = 'https:';
      return url.href.length <= 4096 ? url.href : null;
    } catch { return null; }
  }
  const urls = new Set();
  // Metadata is additive: older flows still consume urls as an array of strings.
  const players = () => [...urls].map(url => ({
    url, name: new URL(url).hostname === 'www.blogger.com' ? 'Blogger Video' : null
  }));
  const add = raw => { const url = playerUrl(raw); if (url && urls.size < 30) urls.add(url); };
  add(location.href);
  for (const element of [...document.querySelectorAll('iframe[src], iframe[data-src], a[href]')].slice(0, 1000)) {
    if (element.tagName === 'IFRAME') {
      add(element.getAttribute('src'));
      add(element.getAttribute('data-src'));
    } else add(element.getAttribute('href'));
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

  const poster = (raw) => {
    try {
      if (!raw || String(raw).length > 2048) return null;
      const url = new URL(raw, location.href);
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      url.hash = '';
      return url.href;
    } catch { return null; }
  };
  const pageImage = document.querySelector('main article img, article img, main img');
  const coverUrl = [
    meta('meta[property="og:image"]'),
    meta('meta[name="twitter:image"]'),
    document.querySelector('link[rel="image_src"]')?.href,
    pageImage?.getAttribute('data-src'), pageImage?.getAttribute('data-original'),
    pageImage?.currentSrc, pageImage?.getAttribute('src')
  ].map(poster).find(Boolean) || null;
  return { version: 1, title, description: meta('meta[property="og:description"]') || meta('meta[name="description"]'), urls: [...urls], players: players(), coverUrl, sourcePage: location.href };
})();
