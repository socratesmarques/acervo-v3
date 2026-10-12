import { acervoOrigin, hostPattern, preferenceKey } from './shared.js';
const $ = (id) => document.getElementById(id);
let captured = { urls: [], description: '', sourcePage: '' }, saved, origin = '', options, preferences = {}, ready = false, busy = false, fromContext = false, seasonEntries = [], movieEntries = [], batchMode = '', movieSelection = new Set(), seasonSelection = new Set();
function status(text, error = false) {
  for (const el of [$('status'), $('batch-status')]) {
    if (el) { el.textContent = text; el.dataset.error = String(error); }
  }
}
function fillSelect(id, items, label, selected, placeholder) {
  const select = $(id); select.replaceChildren(new Option(placeholder, ''));
  for (const item of items) select.add(new Option(label(item), item.id));
  select.value = items.some((item) => item.id === selected) ? selected : '';
}
function updateButtons() {
  const episode = $('mode').value === 'episode';
  $('movie-fields').hidden = episode; $('episode-fields').hidden = !episode;
  $('category').required = !episode; $('category').disabled = episode || busy;
  $('series').required = episode; $('series').disabled = !episode || busy;
  $('season').required = episode; $('season').disabled = !episode || busy;
  $('episode').disabled = !episode || busy;
  $('published').disabled = busy;
  $('fields').disabled = busy;
  $('send').disabled = busy || !ready || !captured.urls.length || !($('title').value.trim()) || !(episode ? $('season').value : $('category').value);
  $('send').textContent = busy ? 'Salvando…' : `${$('published').checked ? 'Publicar' : 'Salvar'} ${episode ? 'episódio' : 'vídeo'}`;
  $('review').disabled = busy || !captured.urls.length || !$('title').value.trim();
  $('connect').disabled = busy; $('refresh').disabled = busy;
}
function updateSeasonNote() {
  const season = options?.seasons.find((s) => s.id === $('season').value);
  const series = options?.series.find((s) => s.id === $('series').value);
  $('next').textContent = season ? `Em branco: próximo disponível (agora: ${season.nextEpisodeNumber}).` : 'Em branco: próximo número disponível.';
  $('series-note').textContent = series && !series.published ? 'Esta série está em rascunho. Publique-a no painel para liberar os episódios.' : '';
  updateButtons();
  renderBatch();
}
function updateSeasons(selected = '') {
  const seasons = (options?.seasons || []).filter((s) => s.seriesId === $('series').value);
  fillSelect('season', seasons, (s) => `T${s.number}${s.title ? ` · ${s.title}` : ''}`, selected, seasons.length ? 'Selecione' : 'Crie uma temporada no painel');
  updateSeasonNote();
}
async function rememberDestination() {
  if (!options?.userId || !origin) return;
  preferences = { ...preferences, mode: $('mode').value, categoryId: $('category').value, seriesId: $('series').value,
    seasonBySeries: { ...preferences.seasonBySeries, ...($('series').value ? { [$('series').value]: $('season').value } : {}) }, published: $('published').checked };
  await chrome.storage.local.set({ [preferenceKey(origin, options.userId)]: preferences });
}
async function message(action, body) {
  const response = await chrome.runtime.sendMessage({ action, origin, ...(body ? { body } : {}) });
  if (!response?.ok) throw new Error(response?.message || 'A extensão não recebeu resposta. Tente novamente.');
  return response.data;
}
async function loadOptions(action = 'options') {
  ready = false; updateButtons();
  const data = await message(action);
  options = data;
  const key = preferenceKey(origin, options.userId);
  preferences = (await chrome.storage.local.get(key))[key] || {};
  $('mode').value = batchMode === 'movies' ? 'movie' : fromContext ? 'episode' : preferences.mode === 'episode' ? 'episode' : 'movie';
  $('published').checked = batchMode ? false : preferences.published === true;
  fillSelect('category', options.categories, (c) => c.name, preferences.categoryId, options.categories.length ? 'Selecione uma categoria' : 'Crie uma categoria no painel');
  fillSelect('series', options.series, (s) => s.title, preferences.seriesId, options.series.length ? 'Selecione uma série' : 'Crie uma série no painel');
  updateSeasons(preferences.seasonBySeries?.[$('series').value]);
  ready = true;
  $('connection').open = false; $('connection-label').textContent = `Conectado · ${new URL(origin).host}`;
  updateButtons(); renderBatch();
}
async function capture() {
  const pending = (await chrome.storage.session.get('contextCapture')).contextCapture;
  if (pending) {
    await chrome.storage.session.remove('contextCapture');
    fromContext = true;
    captured = pending.capture || { urls: [], description: '', sourcePage: '' };
    $('title').value = captured.title || '';
    $('description').value = (captured.description || '').slice(0, 10000);
    $('player').replaceChildren();
    for (const url of captured.urls || []) $('player').add(new Option(url, url));
    $('extras').open = true;
    if (pending.error) status(pending.error, true);
    else status('Episódio capturado pelo menu de contexto. Confira o nome e o player.');
    updateButtons();
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Abra a página do filme ou episódio em uma aba normal.');
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
  captured = result.result;
  if (!captured?.urls) throw new Error('Não foi possível ler a página.');
  let title = captured.title || '', description = captured.description || '';
  if (!title && saved?.title && new URL(saved.sourcePage).origin === new URL(captured.sourcePage).origin) {
    title = saved.title; description = saved.description; status('Nome guardado preenchido. Confira se corresponde a este episódio.');
  } else status(captured.urls.length ? 'Nome preenchido automaticamente. Confira antes de enviar.' : 'Player não encontrado. Guarde o nome e abra a página com o código de incorporação.');
  $('title').value = title; $('description').value = description.slice(0, 10000);
  $('player').replaceChildren();
  for (const url of captured.urls) $('player').add(new Option(url, url));
  if (captured.urls.length > 1 || !title) $('extras').open = true;
  updateButtons();
}
function showResult(result, previous = false) {
  let text = result.duplicate ? `Já cadastrado: ${result.title}. O cadastro existente não foi alterado nem movido.` : `${result.episodeNumber ? `Episódio ${result.episodeNumber}` : 'Vídeo'} ${result.published ? 'publicado' : 'salvo como rascunho'}: ${result.title}.`;
  if (!result.duplicate && result.seriesPublished === false) text += ' A série ainda precisa ser publicada no painel.';
  status((previous ? 'Último envio: ' : '') + text);
  $('result-link').href = `${origin}/admin/videos/${result.id}`; $('result-link').hidden = false;
  const season = options?.seasons.find((s) => s.id === $('season').value);
  if (season && season.id === result.seasonId && result.nextEpisodeNumber) season.nextEpisodeNumber = result.nextEpisodeNumber;
  updateSeasonNote();
}
$('connect').onclick = async () => {
  try {
    origin = acervoOrigin($('origin').value.trim());
    const allowed = await chrome.permissions.request({ origins: [hostPattern(origin)] });
    if (!allowed) throw new Error('Permissão não concedida. Você ainda pode usar Revisar no painel.');
    await chrome.storage.local.set({ acervoOrigin: origin });
    status('Conectando à sua sessão do ACERVO…');
    await loadOptions('connect'); status('Conectado. Escolha o destino uma vez; ele será lembrado.');
  } catch (e) { ready = false; status(e.message, true); $('connection').open = true; updateButtons(); }
};
$('origin').oninput = () => { ready = false; $('connection-label').textContent = 'Endereço alterado · conecte novamente'; updateButtons(); };
$('login').onclick = async () => { try { await chrome.tabs.create({ url: `${acervoOrigin($('origin').value.trim())}/admin` }); } catch (e) { status(e.message, true); } };
$('refresh').onclick = async () => { try { await rememberDestination(); await loadOptions(); status('Destinos atualizados.'); } catch (e) { status(e.message, true); } };
for (const id of ['mode', 'category', 'season', 'published']) $(id).onchange = () => { updateSeasonNote(); rememberDestination().catch((e) => status(e.message, true)); };
$('series').onchange = () => {
  const seasons = options?.seasons.filter((s) => s.seriesId === $('series').value) || [];
  updateSeasons(preferences.seasonBySeries?.[$('series').value] || (seasons.length === 1 ? seasons[0].id : ''));
  $('episode').value = ''; rememberDestination().catch((e) => status(e.message, true));
};
$('season').addEventListener('change', () => { $('episode').value = ''; });
$('title').oninput = updateButtons;
$('remember').onclick = async () => {
  const title = $('title').value.trim(); if (!title) return status('Informe um nome para guardar.');
  saved = { title, description: $('description').value.slice(0, 10000), sourcePage: captured.sourcePage };
  await chrome.storage.session.set({ filmMetadata: saved }); $('restore').hidden = false; $('forget').hidden = false;
  status('Nome guardado nesta sessão. Será sugerido na tela Embed deste mesmo site.');
};
$('restore').onclick = () => { if (saved) { $('title').value = saved.title; $('description').value = saved.description; updateButtons(); status('Nome guardado aplicado. Confira antes de enviar.'); } };
$('forget').onclick = async () => { await chrome.storage.session.remove('filmMetadata'); saved = null; $('restore').hidden = true; $('forget').hidden = true; status('Nome guardado apagado.'); };
$('review').onclick = async () => {
  try {
    const target = acervoOrigin($('origin').value.trim());
    const payload = { version: 1, title: $('title').value.trim(), description: $('description').value.slice(0, 10000), externalUrl: $('player').value };
    const fragment = encodeURIComponent(JSON.stringify(payload));
    if (!payload.title || !payload.externalUrl || fragment.length > 80000) throw new Error('Confira o nome e o player.');
    await chrome.storage.local.set({ acervoOrigin: target });
    await chrome.tabs.create({ url: `${target}/admin/import#${fragment}` }); window.close();
  } catch (e) { status(e.message, true); }
};
$('form').onsubmit = async (event) => {
  event.preventDefault(); if (busy || !ready) return;
  busy = true; updateButtons(); $('result-link').hidden = true; status('Salvando no ACERVO…');
  try {
    await rememberDestination();
    const body = { title: $('title').value.trim(), description: $('description').value.slice(0, 10000), externalUrl: $('player').value, contentType: $('mode').value, published: $('published').checked };
    if (body.contentType === 'episode') { body.seasonId = $('season').value; if ($('episode').value !== '') body.episodeNumber = Number($('episode').value); }
    else body.categoryId = $('category').value;
    const result = await message('save', body); $('episode').value = ''; showResult(result);
  } catch (e) { status(e.message, true); }
  finally { busy = false; updateButtons(); }
};
function matchesSeason(entry, season) {
  if (!season) return false;
  if (entry.seasonLabel) {
    const normalized = (value) => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/^t\d+\s*[·:-]\s*/, '').replace(/^saga\s+/, '').replace(/[^a-z0-9]+/g, ' ').trim();
    return normalized(entry.seasonLabel) === normalized(season.title);
  }
  return entry.seasonNumber !== null && entry.seasonNumber !== undefined && entry.seasonNumber === Number(season.number);
}
function renderBatch() {
  if ($('batch').hidden) return;
  const list = $('batch-list'); list.replaceChildren();
  if (batchMode === 'movies') {
    for (const [index, entry] of movieEntries.entries()) {
      const row = document.createElement('label'); row.className = 'check';
      const check = document.createElement('input'); check.type = 'checkbox'; check.checked = movieSelection.has(index); check.value = String(index);
      check.onchange = () => {
        if (check.checked) movieSelection.add(index); else movieSelection.delete(index);
        $('batch-send').disabled = busy || !ready || movieSelection.size === 0 || !$('category').value;
      };
      const name = document.createElement('span'); name.textContent = entry.title;
      row.append(check, name); list.append(row);
    }
    $('batch-send').disabled = busy || !ready || !movieSelection.size || !$('category').value;
    $('batch-progress').textContent = movieEntries.length
      ? movieEntries.length + ' links candidatos encontrados. Desmarque o que não for filme e selecione a categoria.'
      : 'Nenhum link identificado. Abra uma listagem de filmes e tente novamente.';
    return;
  }
  const season = options?.seasons.find((item) => item.id === $('season').value);
  const entries = season ? seasonEntries.filter((entry) => matchesSeason(entry, season)) : [];
  for (const entry of entries) {
    const index = seasonEntries.indexOf(entry);
    const row = document.createElement('label'); row.className = 'check';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = seasonSelection.has(index); check.value = String(index);
    check.onchange = () => {
      if (check.checked) seasonSelection.add(index); else seasonSelection.delete(index);
      $('batch-send').disabled = busy || !ready || seasonSelection.size === 0 || !$('season').value;
    };
    const name = document.createElement('span');
    name.textContent = 'E' + String(entry.number).padStart(2, '0') + ' · ' + entry.title;
    row.append(check, name); list.append(row);
  }
  $('batch-send').disabled = busy || !ready || !entries.length || !entries.some((entry) => seasonSelection.has(seasonEntries.indexOf(entry)));
  const available = [...new Set(seasonEntries.map((entry) => entry.seasonLabel || entry.seasonNumber).filter(Boolean))];
  $('batch-progress').textContent = entries.length
    ? entries.length + ' episódios dublados encontrados para ' + (season.title || 'T' + season.number) + '.'
    : seasonEntries.length
      ? 'Nenhum episódio da temporada selecionada. Temporadas detectadas: ' + (available.join(', ') || 'não identificadas') + '.'
      : 'Nenhum link de episódio encontrado nesta página.';
}
function moveDestinationToBatch() {
  const destination = batchMode === 'movies' ? $('movie-fields') : $('episode-fields');
  $('batch-destination').append(destination, $('published').closest('label'));
  $('form').hidden = true;
}
function showBatch(entries) {
  batchMode = 'season';
  seasonEntries = entries.filter((entry) => entry?.url && Number.isInteger(entry.number));
  seasonSelection = new Set(seasonEntries.map((_, index) => index));
  moveDestinationToBatch();
  $('batch-heading').textContent = 'Importar temporada';
  $('batch-help').textContent = 'Selecione os episódios dublados. Confira série e temporada antes do envio.';
  $('batch').hidden = false; $('send').hidden = true; $('review').hidden = true;
  renderBatch();
  status(seasonEntries.length ? seasonEntries.length + ' links capturados. Escolha a temporada.'
    : 'Nenhum link dublado foi encontrado nesta página.', !seasonEntries.length);
}
function showMovies(entries, error = '') {
  batchMode = 'movies'; movieEntries = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry?.url || typeof entry.title !== 'string') continue;
    try {
      const url = new URL(entry.url);
      const title = entry.title.replace(/\s+/g, ' ').trim().slice(0, 160);
      if (url.protocol !== 'https:' || url.username || url.password || !title || seen.has(url.href)) continue;
      seen.add(url.href); movieEntries.push({ title, url: url.href });
      if (movieEntries.length >= 120) break;
    } catch {}
  }
  movieSelection = new Set(movieEntries.map((_, index) => index));
  moveDestinationToBatch();
  $('batch-heading').textContent = 'Importar filmes desta página';
  $('batch-help').textContent = 'Os links são candidatos, não filmes confirmados. Desmarque menus, séries e resultados incorretos, escolha a categoria e revise antes de enviar.';
  $('batch').hidden = false; $('send').hidden = true; $('review').hidden = true;
  renderBatch();
  status(error || (movieEntries.length ? movieEntries.length + ' links encontrados para revisão.'
    : 'Não encontrei filmes nesta página. Abra uma lista com títulos visíveis.'), !!error || !movieEntries.length);
}
$('batch-send').onclick = async () => {
  if (busy || !ready) return;
  const movieMode = batchMode === 'movies';
  const source = movieMode ? movieEntries : seasonEntries;
  const selected = [...$('batch-list').querySelectorAll('input:checked')].map((input) => source[Number(input.value)]).filter(Boolean);
  if (!selected.length) return status('Selecione pelo menos um item.', true);
  const destination = movieMode ? options?.categories.find((item) => item.id === $('category').value)
    : options?.seasons.find((item) => item.id === $('season').value);
  if (!destination || (!movieMode && selected.some((entry) => !matchesSeason(entry, destination))))
    return status(movieMode ? 'Escolha uma categoria válida.' : 'Confira a série e a temporada.', true);
  const published = $('published').checked;
  if (!window.confirm('Importar ' + selected.length + ' itens como ' + (published ? 'PUBLICADOS' : 'RASCUNHOS') +
    ' no ACERVO? Confirme que você pode usar esses vídeos e revise os títulos selecionados.')) return;
  let hosts;
  try {
    hosts = [...new Set(selected.map((entry) => 'https://' + new URL(entry.url).hostname + '/*'))];
    if (!(await chrome.permissions.request({ origins: hosts }))) return status('Permita o acesso aos links selecionados.', true);
  } catch (error) { return status(error.message, true); }
  busy = true; updateButtons(); $('batch-send').disabled = true;
  let savedCount = 0, duplicateCount = 0;
  const failures = [], failedItems = [];
  try {
    await rememberDestination();
    for (const [index, entry] of selected.entries()) {
      $('batch-progress').textContent = (index + 1) + '/' + selected.length + ' · ' + entry.title;
      try {
        const page = await message('capturePage', { url: entry.url });
        if (!page?.urls?.length) throw new Error('Não foi encontrado um player compatível');
        const body = { title: entry.title.slice(0, 160), description: (page.description || '').slice(0, 10000),
          externalUrl: page.urls[0], contentType: movieMode ? 'movie' : 'episode', published };
        if (movieMode) body.categoryId = destination.id;
        else { body.seasonId = destination.id; body.episodeNumber = entry.number; }
        const result = await message('save', body);
        if (result.duplicate) duplicateCount++; else savedCount++;
      } catch (error) {
        failedItems.push(entry);
        failures.push(entry.title.slice(0, 60) + ': ' + error.message);
      }
      // API: máximo de 60 gravações por minuto.
      if (index < selected.length - 1) await new Promise((resolve) => setTimeout(resolve, 1400));
    }
  } catch (error) { failures.push('Falha no lote: ' + error.message); }
  finally {
    busy = false;
    // Repetir apenas os itens que falharam.
    const retryIndexes = new Set(failedItems.map((entry) => source.indexOf(entry)));
    if (movieMode) movieSelection = retryIndexes; else seasonSelection = retryIndexes;
    updateButtons(); renderBatch();
    $('batch-progress').textContent = savedCount + ' salvos, ' + duplicateCount + ' duplicados, ' + failures.length + ' falhas.';
    status(failures.length ? failures.slice(0, 12).join(' · ').slice(0, 1300) +
      (failures.length > 12 ? ' · e outras ' + (failures.length - 12) + ' falhas.' : '')
      : 'Lote concluído. Confira os vídeos no painel do ACERVO.', Boolean(failures.length));
  }
};
async function initialize() {
  const settings = await chrome.storage.local.get('acervoOrigin'); origin = settings.acervoOrigin || ''; $('origin').value = origin;
  saved = (await chrome.storage.session.get('filmMetadata')).filmMetadata;
  $('restore').hidden = !saved; $('forget').hidden = !saved; $('connection').open = !origin;
  const params = new URLSearchParams(location.search);
  if (params.has('movies')) {
    const pending = (await chrome.storage.session.get('movieCapture')).movieCapture;
    await chrome.storage.session.remove('movieCapture');
    showMovies(pending?.entries || [], pending?.error || '');
  } else if (params.has('season')) {
    const pending = (await chrome.storage.session.get('seasonCapture')).seasonCapture;
    await chrome.storage.session.remove('seasonCapture');
    fromContext = true; showBatch(pending?.entries || []);
  } else await capture();
  if (origin) {
    try {
      origin = acervoOrigin(origin); await loadOptions();
      if (!$('batch').hidden) { renderBatch(); status($('batch-progress').textContent, !(batchMode === 'movies' ? movieEntries.length : seasonEntries.length)); return; }
      const job = (await chrome.storage.session.get('quickImportJob')).quickImportJob;
      if (job?.origin === origin && job.status === 'done') showResult(job.data, true);
      else if (job?.origin === origin && job.status === 'error') status(`Último envio sem confirmação: ${job.message}`, true);
      else if (job?.origin === origin && job.status === 'pending') status('Existe um envio sem confirmação. Aguarde e reabra a extensão. Reenviar o mesmo player não duplica o cadastro.');
    } catch (e) { status(e.message, true); $('connection').open = true; }
  }
}
initialize().catch((error) => status(`Não foi possível capturar: ${error.message}`, true));
