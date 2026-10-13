import { acervoOrigin, hostPattern, preferenceKey } from './shared.js';
import { parseLinkList } from './links-parse.mjs';
import { expandSeriesSource, normalizeSeriesEpisodes } from './series-import.mjs';
const $ = (id) => document.getElementById(id);
let origin = '', options, ready = false, busy = false, failed = [], pendingCovers = [], pendingEpisodeHosts = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function status(message, error = false) {
  $('status').textContent = message; $('status').dataset.error = String(error);
}
function row(message, type) {
  const li = document.createElement('li'); li.textContent = message;
  if (type) li.dataset.state = type;
  $('results').append(li);
  return li;
}
function buttons() {
  $('start').disabled = busy || !ready || !$('category').value || !$('links').value.trim();
  $('retry').disabled = busy || !ready || !failed.length;
  $('category').disabled = busy || !ready;
  $('connect').disabled = busy;
  $('refresh').disabled = busy || !ready;
  $('published').disabled = busy;
  $('links').disabled = busy;
  $('episode-hosts').disabled = busy || !pendingEpisodeHosts.length;
  $('episode-hosts').hidden = !pendingEpisodeHosts.length;
  $('covers').disabled = busy || !pendingCovers.length;
  $('covers').hidden = !pendingCovers.length;
}
async function message(action, body) {
  const answer = await chrome.runtime.sendMessage({ action, origin, ...(body ? { body } : {}) });
  if (!answer?.ok) throw new Error(answer?.message || 'Sem confirmação do ACERVO.');
  return answer.data;
}
async function categories(action = 'options') {
  ready = false; buttons();
  const response = await message(action);
  if (!response.userId || !Array.isArray(response.categories)) throw new Error('Categorias indisponíveis.');
  options = response;
  const prefs = (await chrome.storage.local.get(preferenceKey(origin, response.userId)))[preferenceKey(origin, response.userId)] || {};
  $('category').replaceChildren(new Option('Selecione uma categoria', ''));
  for (const item of response.categories) $('category').add(new Option(item.name, item.id));
  $('category').value = response.categories.some((x) => x.id === prefs.categoryId) ? prefs.categoryId : '';
  ready = true;
  $('connection').open = false; $('connection-label').textContent = 'Conectado · ' + new URL(origin).host;
  buttons();
}
$('connect').onclick = async () => {
  try {
    const target = acervoOrigin($('origin').value.trim());
    const permission = chrome.permissions.request({ origins: [hostPattern(target)] });
    if (!(await permission)) throw new Error('Autorize a conexão ao ACERVO.');
    origin = target;
    await chrome.storage.local.set({ acervoOrigin: origin });
    await categories('connect');
    status('Conectado. Cole as páginas de séries e selecione a categoria.');
  } catch (e) { ready = false; buttons(); $('connection').open = true; status(e.message, true); }
};
$('origin').oninput = () => { ready = false; buttons(); };
$('category').onchange = buttons;
$('links').oninput = buttons;
$('refresh').onclick = async () => {
  try { await categories(); status('Categorias atualizadas.'); }
  catch (e) { status(e.message, true); }
};
$('open-site').onclick = async () => {
  try { await chrome.tabs.create({ url: acervoOrigin($('origin').value.trim()) + '/admin' }); }
  catch (e) { status(e.message, true); }
};
function pattern(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.href.length > 2048 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(u.hostname) ||
        /(?:^|\.)(?:localhost|local|internal|lan|test|invalid)$/.test(u.hostname)) return null;
    return u.origin + '/*';
  } catch { return null; }
}
function originPatterns(list) {
  return [...new Set(list.map((x) => 'https://' + new URL(x.url).hostname + '/*'))];
}
async function uploadSeriesCover(id, imageUrl, title) {
  const host = pattern(imageUrl);
  if (!host) return;
  if (!(await chrome.permissions.contains({ origins: [host] }))) {
    pendingCovers.push({ id, imageUrl, title, host });
    return;
  }
  await message('uploadCover', { videoId: id, url: imageUrl });
}
async function importSeries(items) {
  if (busy || !ready || !options.categories.some((x) => x.id === $('category').value)) {
    status('Escolha uma categoria válida e conecte ao ACERVO.', true); return;
  }
  // Deve ser invocado diretamente pelo clique: Chrome exige gesto do usuário.
  let grant;
  try { grant = chrome.permissions.request({ origins: originPatterns(items) }); }
  catch (error) { status(error.message, true); return; }
  busy = true; buttons(); $('results').replaceChildren();
  $('retry').hidden = true; pendingCovers = []; pendingEpisodeHosts = []; failed = [];
  const categoryId = $('category').value, published = $('published').checked;
  const visited = new Set(), repeated = new Set();
  let totalPages = 0, savedSeries = 0, existingSeries = 0, episodesSaved = 0, episodesDuplicate = 0, failures = 0;
  let processedSeries = 0;
  const progress = (label = '') => {
    $('progress').textContent = 'Páginas ' + totalPages + '/' + items.length + ' · Séries ' + processedSeries +
      ' (novas ' + savedSeries + ', existentes ' + existingSeries + ')' +
      ' · Episódios ' + episodesSaved + ' importados, ' + episodesDuplicate +
      ' duplicados · ' + failures + ' falhas' + (label ? ' · ' + label : '');
  };
  try {
    if (!(await grant)) throw new Error('Acesso às páginas não autorizado.');
    const key = preferenceKey(origin, options.userId);
    const saved = (await chrome.storage.local.get(key))[key] || {};
    await chrome.storage.local.set({ [key]: { ...saved, categoryId, published } });
    for (const source of items) {
      progress('Lendo ' + source.url);
      try {
        const jobs = source.capture ? [source] : expandSeriesSource(source, await message('scanSeriesPage', { url: source.url }));
        for (const entry of jobs) {
          const resultRow = row('Série: ' + (entry.title || entry.url));
          if (visited.has(entry.url)) {
            resultRow.textContent = 'Repetida na lista: ' + entry.url; resultRow.dataset.state = 'duplicate';
            continue;
          }
          visited.add(entry.url);
          if (processedSeries >= 120) throw new Error('Limite de 120 séries por lote. Importe o restante separadamente.');
          processedSeries++;
          try {
            const detail = entry.capture || await message('scanSeriesPage', { url: entry.url });
            if (detail?.kind !== 'series') throw new Error('A página não contém episódios identificados. Abra a página da série.');
            const episodes = normalizeSeriesEpisodes(detail.episodes);
            if (!episodes.length) throw new Error('Nenhum episódio dublado válido encontrado.');
            const episodeHosts = [...new Set(episodes.map((e) => 'https://' + new URL(e.url).hostname + '/*'))];
            for (const host of episodeHosts) {
              if (!(await chrome.permissions.contains({ origins: [host] })) && !pendingEpisodeHosts.includes(host)) pendingEpisodeHosts.push(host);
            }
            if (pendingEpisodeHosts.length) throw new Error('Acesso a servidor externo de episódios necessário. Autorize os servidores e repita a série.');
            const title = String(entry.title || detail.page?.title || '').trim().slice(0, 160);
            if (!title) throw new Error('Nome não identificado. Use Nome da série | URL.');
            const imageUrl = entry.coverUrl || detail.page?.coverUrl;
            // Antes de criar a série, verificar que ao menos um episódio tem player.
            const preloaded = new Map();
            for (const episode of episodes.slice(0, 3)) {
              try {
                const capture = await message('capturePage', { url: episode.url });
                if (capture?.urls?.length) {
                  preloaded.set(episode.url, capture);
                  break;
                }
              } catch { /* O resultado será indicado se nenhum episódio for acessível. */ }
            }
            if (!preloaded.size) throw new Error('Nenhum player compatível nos primeiros episódios. Série não cadastrada.');
            const series = await message('saveSeries', {
              sourcePage: entry.url, title,
              description: String(detail.page?.description || '').slice(0, 10000),
              categoryId, published
            });
            if (series.duplicate) existingSeries++; else savedSeries++;
            const seasons = new Map();
            let episodeErrors = 0;
            for (const episode of episodes) {
              progress(title + ' · T' + episode.seasonNumber + ' E' + episode.number);
              try {
                let season = seasons.get(episode.seasonNumber);
                if (!season) {
                  season = await message('ensureSeason', {
                    seriesId: series.id, number: episode.seasonNumber, title: episode.seasonTitle
                  });
                  seasons.set(episode.seasonNumber, season);
                }
                const page = preloaded.get(episode.url) || await message('capturePage', { url: episode.url });
                if (!page?.urls?.length) throw new Error('Player não encontrado.');
                const result = await message('save', {
                  title: episode.title, description: String(page.description || '').slice(0, 10000),
                  externalUrl: page.urls[0], contentType: 'episode', seasonId: season.id,
                  episodeNumber: episode.number, published
                });
                if (result.duplicate) episodesDuplicate++; else episodesSaved++;
              } catch (error) {
                failures++; episodeErrors++;
                row('Falha T' + episode.seasonNumber + 'E' + episode.number + ' (' + episode.url + '): ' + error.message, 'error');
              }
              await pause(1400); // Limite da API: 60 cadastros/minuto.
            }
            if (imageUrl) {
              try { await uploadSeriesCover(series.id, imageUrl, title); }
              catch (error) { row('Série salva, mas capa pendente: ' + title + ': ' + error.message, 'error'); }
            }
            resultRow.dataset.state = episodeErrors ? 'error' : series.duplicate ? 'duplicate' : 'saved';
            resultRow.textContent = (series.duplicate ? 'Série já cadastrada: ' : 'Série criada: ') +
              title + ' · ' + episodes.length + ' episódios analisados' +
              (episodeErrors ? ' · ' + episodeErrors + ' falha(s)' : '');
            if (episodeErrors) {
              failed.push({ url: entry.url, title, coverUrl: imageUrl || null });
              repeated.add(entry.url);
            }
          } catch (error) {
            failures++;
            resultRow.dataset.state = 'error';
            resultRow.textContent = 'Falhou (' + entry.url + '): ' + error.message;
            if (!repeated.has(entry.url)) { failed.push({ url: entry.url, title: entry.title || '', coverUrl: entry.coverUrl || null }); repeated.add(entry.url); }
          }
        }
      } catch (error) {
        failures++;
        row('Página ' + source.url + ': ' + error.message, 'error');
        if (!repeated.has(source.url)) { failed.push(source); repeated.add(source.url); }
      }
      totalPages++; progress();
    }
    status(failures
      ? 'Importação terminada com falhas. Revise os links e repita somente os problemas.'
      : 'Importação concluída. Confira as séries e temporadas no painel.',
      failures > 0);
  } catch (error) { status(error.message, true); }
  finally {
    busy = false;
    $('retry').hidden = !failed.length;
    buttons();
  }
}
$('start').onclick = () => {
  try { importSeries(parseLinkList($('links').value)); }
  catch (error) { status(error.message, true); }
};
$('retry').onclick = () => { if (failed.length) importSeries([...failed]); };
$('covers').onclick = async () => {
  if (busy || !pendingCovers.length) return;
  let permission;
  try { permission = chrome.permissions.request({ origins: [...new Set(pendingCovers.map((x) => x.host))] }); }
  catch (error) { return status(error.message, true); }
  busy = true; buttons();
  const items = pendingCovers; pendingCovers = [];
  try {
    if (!(await permission)) throw new Error('Domínios das capas não autorizados.');
    for (const item of items) {
      try {
        await message('uploadCover', { videoId: item.id, url: item.imageUrl });
        row('Capa salva: ' + item.title, 'saved');
      } catch (error) { row('Capa pendente: ' + item.title + ' — ' + error.message, 'error'); pendingCovers.push(item); }
    }
    status('Capas processadas. Confira os avisos.', pendingCovers.length > 0);
  } catch (error) { pendingCovers = items; status(error.message, true); }
  finally { busy = false; buttons(); }
};
$('episode-hosts').onclick = async () => {
  if (busy || !pendingEpisodeHosts.length) return;
  let permission;
  try { permission = chrome.permissions.request({ origins: pendingEpisodeHosts }); }
  catch (error) { status(error.message, true); return; }
  busy = true; buttons();
  try {
    if (!(await permission)) throw new Error('Os domínios dos episódios não foram autorizados.');
    pendingEpisodeHosts = [];
    status('Servidores autorizados. Clique em Repetir somente as falhas.');
  } catch (error) { status(error.message, true); }
  finally { busy = false; buttons(); }
};
async function init() {
  const stored = (await chrome.storage.local.get('acervoOrigin')).acervoOrigin;
  origin = stored || ''; $('origin').value = origin; $('connection').open = !origin;
  if (new URLSearchParams(location.search).has('context')) {
    const captured = (await chrome.storage.session.get('seriesPageCandidates')).seriesPageCandidates;
    await chrome.storage.session.remove('seriesPageCandidates');
    const entries = (captured?.entries || []).slice(0, 120);
    $('links').value = entries.length
      ? entries.map((item) => String(item.title || '').trim() + ' | ' + item.url).join('\n')
      : (captured?.sourcePage || '');
    if (captured?.error) status(captured.error, true);
  }
  if (origin) {
    try { origin = acervoOrigin(origin); await categories(); status('Revise os links das séries e escolha uma categoria.'); }
    catch (error) { $('connection').open = true; status(error.message, true); }
  }
  buttons();
}
init().catch((error) => status(error.message, true));
