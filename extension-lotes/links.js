import { acervoOrigin, hostPattern, preferenceKey } from './shared.js';
import { parseLinkList } from './links-parse.mjs';
import { expandMovieSource } from './link-import.mjs';

const IMPORT_COVERS = true;
const $ = (id) => document.getElementById(id);
let origin = '', options = null, ready = false, busy = false, failed = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function status(message, error = false) {
  $('status').textContent = message;
  $('status').dataset.error = String(error);
}
function buttons() {
  $('start').disabled = !ready || busy || !$('category').value || !$('links').value.trim();
  $('retry').disabled = !ready || busy || !$('category').value || !failed.length;
  $('category').disabled = !ready || busy;
  $('connect').disabled = busy;
  $('refresh').disabled = !ready || busy;
  $('published').disabled = busy;
  $('links').disabled = busy;
}
async function message(action, body) {
  const response = await chrome.runtime.sendMessage({ action, origin, ...(body ? { body } : {}) });
  if (!response?.ok) throw new Error(response?.message || 'O ACERVO não confirmou a operação.');
  return response.data;
}
async function loadCategories(action = 'options') {
  ready = false;
  buttons();
  const data = await message(action);
  if (!Array.isArray(data?.categories) || !data.userId) throw new Error('Servidor não retornou as categorias.');
  options = data;
  const key = preferenceKey(origin, data.userId);
  const saved = (await chrome.storage.local.get(key))[key] || {};
  $('category').replaceChildren(new Option('Escolha uma categoria', ''));
  for (const item of data.categories) $('category').add(new Option(item.name, item.id));
  $('category').value = data.categories.some((item) => item.id === saved.categoryId) ? saved.categoryId : '';
  $('connection-label').textContent = 'Conectado · ' + new URL(origin).host;
  $('connection').open = false;
  ready = true;
  buttons();
}
$('connect').onclick = async () => {
  try {
    const target = acervoOrigin($('origin').value.trim());
    const allowed = await chrome.permissions.request({ origins: [hostPattern(target)] });
    if (!allowed) throw new Error('Autorize o endereço do ACERVO para conectar.');
    origin = target;
    await chrome.storage.local.set({ acervoOrigin: origin });
    await loadCategories('connect');
    status('Conectado. Escolha a categoria e cole os links das páginas.');
  } catch (error) { ready = false; buttons(); $('connection').open = true; status(error.message, true); }
};
$('open-site').onclick = async () => {
  try { await chrome.tabs.create({ url: acervoOrigin($('origin').value.trim()) + '/admin' }); }
  catch (error) { status(error.message, true); }
};
$('refresh').onclick = async () => {
  try { await loadCategories(); status('Categorias atualizadas.'); }
  catch (error) { status(error.message, true); }
};
$('origin').oninput = () => { ready = false; buttons(); };
$('category').onchange = buttons;
$('links').oninput = buttons;
function permissionPatterns(items) {
  return [...new Set(items.map((item) => 'https://' + new URL(item.url).hostname + '/*'))];
}
function resultRow(label) {
  const row = document.createElement('li');
  row.textContent = label;
  $('results').append(row);
  return row;
}
function coverPattern(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.href.length > 2048 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) ||
        /(?:^|\.)(?:localhost|local|internal|lan|test|invalid)$/.test(url.hostname)) return null;
    return url.origin + '/*';
  } catch { return null; }
}
async function maybeUploadCover(result, raw) {
  if (!IMPORT_COVERS || result.duplicate || !result.id || !raw) return '';
  const pattern = coverPattern(raw);
  if (!pattern) return '';
  if (!(await chrome.permissions.contains({ origins: [pattern] }))) return 'capa não autorizada';
  await message('uploadCover', { videoId: result.id, url: raw });
  return 'capa salva';
}
async function importBatch(items) {
  if (busy || !ready || !options?.categories.some((item) => item.id === $('category').value))
    return status('Escolha uma categoria válida e conecte ao ACERVO.', true);
  let grant;
  try {
    // O Chrome exige que a solicitação seja iniciada no clique, antes de qualquer await.
    grant = chrome.permissions.request({ origins: permissionPatterns(items) });
  } catch (error) { return status(error.message, true); }
  busy = true;
  buttons();
  $('retry').hidden = true;
  $('results').replaceChildren();
  failed = [];
  const seenPages = new Set(), seenPlayers = new Set();
  let saved = 0, duplicates = 0, movieFailures = 0, attemptedMovies = 0, completedPages = 0, covers = 0;
  const categoryId = $('category').value, published = $('published').checked;

  function progress(detail = '') {
    $('progress').textContent = 'Páginas ' + completedPages + '/' + items.length +
      ' · Filmes analisados ' + attemptedMovies + ' · Salvos ' + saved +
      ' · Duplicados ' + duplicates + ' · Falhas ' + movieFailures +
      (detail ? ' · ' + detail : '');
  }
  try {
    if (!(await grant)) throw new Error('Permissão para acessar as páginas não concedida.');
    const key = preferenceKey(origin, options.userId);
    const data = (await chrome.storage.local.get(key))[key] || {};
    await chrome.storage.local.set({ [key]: { ...data, categoryId, published } });
    for (const source of items) {
      const heading = resultRow('Página: ' + source.url);
      heading.dataset.state = 'page';
      progress('Lendo página ' + (completedPages + 1));
      try {
        // Um link pode ser página individual ou uma listagem de dezenas de filmes.
        const jobs = source.kind === 'movie'
          ? [source]
          : expandMovieSource(source, await message('scanMoviePage', { url: source.url }));
        heading.textContent = source.url + ' · ' + jobs.length + (jobs.length === 1 ? ' filme' : ' filmes') + ' encontrado(s)';
        for (const job of jobs) {
          const row = resultRow('Analisando: ' + (job.title || job.url));
          attemptedMovies++;
          progress(job.title || job.url);
          if (seenPages.has(job.url)) {
            duplicates++;
            row.dataset.state = 'duplicate';
            row.textContent = 'Repetido na lista: ' + (job.title || job.url);
            continue;
          }
          try {
            // Usa a captura e o cadastro já usados por "Importar filmes desta página".
            const page = job.page || await message('capturePage', { url: job.url });
            if (!page?.urls?.length) throw new Error('Player compatível não encontrado.');
            const player = page.urls[0];
            if (seenPlayers.has(player)) {
              seenPages.add(job.url);
              duplicates++;
              row.dataset.state = 'duplicate';
              row.textContent = 'Player repetido no lote: ' + (job.title || job.url);
              continue;
            }
            const title = String(job.title || page.title || '').trim().slice(0, 160);
            if (!title) throw new Error('Título não encontrado; informe Nome do filme | URL.');
            const result = await message('save', {
              title, description: String(page.description || '').slice(0, 10000),
              externalUrl: player, contentType: 'movie', categoryId, published
            });
            seenPages.add(job.url);
            seenPlayers.add(player);
            if (result.duplicate) {
              duplicates++;
              row.dataset.state = 'duplicate';
              row.textContent = 'Já cadastrado: ' + result.title;
            } else {
              saved++;
              row.dataset.state = 'saved';
              row.textContent = 'Salvo: ' + result.title;
              // Falha na capa não desfaz o filme já cadastrado.
              if (IMPORT_COVERS) {
                try {
                  const coverStatus = await maybeUploadCover(result, job.coverUrl || page.coverUrl);
                  if (coverStatus === 'capa salva') covers++;
                  if (coverStatus) row.textContent += ' (' + coverStatus + ')';
                } catch (error) { row.textContent += ' (capa não salva: ' + error.message + ')'; }
              }
            }
          } catch (error) {
            failed.push({ kind: 'movie', url: job.url, title: job.title || '', coverUrl: job.coverUrl || null });
            movieFailures++;
            row.dataset.state = 'error';
            row.textContent = 'Falhou (' + job.url + '): ' + error.message;
          }
          progress();
          // A API permite até 60 gravações por minuto.
          await sleep(1400);
        }
      } catch (error) {
        failed.push(source);
        movieFailures++;
        heading.dataset.state = 'error';
        heading.textContent = 'Falha na página (' + source.url + '): ' + error.message;
      }
      completedPages++;
      progress();
    }
    status(failed.length
      ? 'Concluído com falhas. Você pode tentar novamente apenas as páginas/filmes que falharam.'
      : 'Importação concluída. Confira os filmes no painel do ACERVO.' +
        (covers ? ' Capas salvas: ' + covers + '.' : ''), failed.length > 0);
  } catch (error) {
    $('progress').textContent = 'Importação não iniciada.';
    status(error.message, true);
  } finally {
    busy = false;
    $('retry').hidden = !failed.length;
    buttons();
  }
}
$('start').onclick = () => {
  try { importBatch(parseLinkList($('links').value)); }
  catch (error) { status(error.message, true); }
};
$('retry').onclick = () => { if (failed.length) importBatch([...failed]); };
async function init() {
  const saved = (await chrome.storage.local.get('acervoOrigin')).acervoOrigin;
  origin = saved || '';
  $('origin').value = origin;
  $('connection').open = !origin;
  if (origin) {
    try { origin = acervoOrigin(origin); await loadCategories(); status('Cole as URLs das páginas de filmes.'); }
    catch (error) { $('connection').open = true; status(error.message, true); }
  }
  buttons();
}
init().catch((error) => status(error.message, true));
