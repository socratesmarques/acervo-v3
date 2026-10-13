// Linhas aceitas: URL ou Nome do filme | URL. Nenhuma requisição é feita aqui.
export function parseLinkList(text, maxItems = 50) {
  if (typeof text !== 'string' || text.length > 120000)
    throw new Error('Lista muito grande. Use até 50 links por lote.');
  const items = [];
  const seen = new Set();
  for (const [index, value] of text.split(/\r?\n/).entries()) {
    const line = value.trim();
    if (!line) continue;
    const labelled = line.match(/^(.{1,160}?)\s+\|\s+(https:\/\/\S+)$/i);
    const title = labelled ? labelled[1].trim() : '';
    const raw = labelled ? labelled[2] : line;
    if (/\s/.test(raw)) throw new Error('Linha ' + (index + 1) + ': deixe apenas um link por linha.');
    let url;
    try { url = new URL(raw); }
    catch { throw new Error('Linha ' + (index + 1) + ': URL inválida.'); }
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.href.length > 2048)
      throw new Error('Linha ' + (index + 1) + ': use um endereço HTTPS válido, sem usuário ou senha.');
    url.hash = '';
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    items.push({ url: url.href, title });
    if (items.length > maxItems) throw new Error('Máximo de ' + maxItems + ' links diferentes por lote.');
  }
  if (!items.length) throw new Error('Cole pelo menos um link HTTPS.');
  return items;
}
