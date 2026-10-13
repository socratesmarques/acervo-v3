import { acervoOrigin, hostPattern } from './shared.js';
import { requestOnSite } from './bridge.js';
let saving = false;

function photoLink(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.href.length > 2048 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|lan|test|invalid)$/.test(url.hostname))
    throw new Error('Endereço da capa não permitido.');
  return url;
}
async function getCoverData(value) {
  const url = photoLink(value);
  if (!(await chrome.permissions.contains({ origins: [url.origin + '/*'] })))
    throw new Error('Permissão para o domínio da capa não concedida.');
  let response;
  try {
    response = await fetch(url.href, {
      credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(12000)
    });
  } catch { throw new Error('Não consegui acessar a imagem da capa.'); }
  if (!response.ok) throw new Error('O servidor da imagem recusou o download.');
  const mime = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!['image/jpeg','image/png','image/webp'].includes(mime))
    throw new Error('O arquivo da capa não é uma imagem JPG, PNG ou WebP.');
  const maximum = 4 * 1024 * 1024;
  if (Number(response.headers.get('content-length') || 0) > maximum || !response.body)
    throw new Error('Capa grande demais ou sem conteúdo.');
  const reader = response.body.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) {
        await reader.cancel().catch(() => {});
        throw new Error('Capa maior que 4 MB.');
      }
      parts.push(value);
    }
  } catch (error) { throw error; }
  if (size < 100) throw new Error('Imagem da capa vazia.');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return { mime, base64: btoa(binary) };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// O status "complete" inclui imagens, anúncios e players externos. Para o
// importador basta o documento estar pronto para receber scripts.
async function waitForTab(id, label = 'A página', timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const tab = await chrome.tabs.get(id);
      if (!tab.url || !/^https?:/.test(tab.url)) {
        await delay(400);
        continue;
      }
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: id },
        func: () => document.readyState
      });
      if (result?.result === 'interactive' || result?.result === 'complete') return;
    } catch (error) {
      lastError = error.message;
    }
    await delay(400);
  }
  throw new Error(label + ' demorou para carregar o documento.' +
    (lastError ? ' Detalhe: ' + lastError : ' Abra a página em uma aba e tente novamente.'));
}
async function siteTab(origin, create) {
  const pattern = hostPattern(origin);
  if (!(await chrome.permissions.contains({ origins: [pattern] }))) throw new Error('Clique em Conectar para autorizar apenas o endereço do seu ACERVO.');
  const tabs = await chrome.tabs.query({ url: pattern });
  let tab = tabs.find((tab) => { try { return new URL(tab.url).origin === origin; } catch { return false; } });
  if (!tab && create) tab = await chrome.tabs.create({ url: `${origin}/admin`, active: false });
  if (!tab) throw new Error('Abra uma aba do ACERVO ou clique em Conectar.');
  await waitForTab(tab.id, 'A aba do ACERVO', 35000);
  return tab.id;
}

async function scanMoviePage(url) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.username || target.password || target.href.length > 2048)
    throw new Error('Use uma página HTTPS válida.');
  const configured = (await chrome.storage.local.get('acervoOrigin')).acervoOrigin;
  const pattern = `https://${target.hostname}/*`;
  if (!(await chrome.permissions.contains({ origins: [pattern] })))
    throw new Error('Autorize o domínio da página antes de importar.');
  if (!configured) throw new Error('Conecte ao seu ACERVO primeiro.');
  const tab = await chrome.tabs.create({ url: target.href, active: false });
  try {
    await waitForTab(tab.id, 'A página de filmes', 25000);
    // Uma página de filme é importada diretamente. Uma listagem usa o mesmo
    // detector movies.js do menu "Importar filmes desta página".
    const [individual] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
    if (individual?.result?.urls?.length)
      return { kind: 'movie', page: individual.result };
    let entries = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['movies.js'] });
      entries = Array.isArray(result?.result) ? result.result : [];
      if (entries.length) break;
      if (attempt < 2) await delay(1200);
    }
    return { kind: 'listing', entries };
  } finally {
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}


async function scanSeriesPage(raw) {
  const target = new URL(raw);
  if (target.protocol !== 'https:' || target.username || target.password || target.href.length > 2048)
    throw new Error('URL de série inválida.');
  const pattern = `https://${target.hostname}/*`;
  if (!(await chrome.permissions.contains({ origins: [pattern] })))
    throw new Error('Autorize o domínio da série antes de importar.');
  const tab = await chrome.tabs.create({ url: target.href, active: false });
  try {
    await waitForTab(tab.id, 'A página de séries', 25000);
    const [meta] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
    let episodes = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const [response] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['season.js'] });
      episodes = Array.isArray(response?.result) ? response.result : [];
      if (episodes.length) break;
      if (attempt < 2) await delay(1200);
    }
    if (episodes.length) return { kind: 'series', page: meta?.result || {}, episodes };
    // A mesma heurística de cartões usada para importar filmes de listagens.
    const [listing] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['movies.js'] });
    return { kind: 'listing', entries: listing?.result || [] };
  } finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
}

export async function handleMessage(message) {
  const origin = acervoOrigin(message.origin);
  if (!['connect', 'options', 'save', 'captureEpisode', 'capturePage', 'scanMoviePage', 'scanSeriesPage', 'uploadCover', 'saveSeries', 'ensureSeason'].includes(message.action)) throw new Error('Operação inválida.');
  if (message.action === 'scanSeriesPage') {
    return { ok: true, data: await scanSeriesPage(message.body?.url) };
  }
  if (message.action === 'scanMoviePage') {
    return { ok: true, data: await scanMoviePage(message.body?.url) };
  }
  if (message.action === 'captureEpisode' || message.action === 'capturePage') {
    const target = new URL(message.body.url);
    if (target.protocol !== 'https:' || target.username || target.password) throw new Error('Link inválido.');
    const allowed = await chrome.permissions.contains({ origins: [`https://${target.hostname}/*`] });
    if (!allowed) throw new Error('Autorize o site de origem antes de importar.');
    const tab = await chrome.tabs.create({ url: target.href, active: false });
    try {
      await waitForTab(tab.id, 'A página do vídeo', 25000);
      let capture;
      // Players dinâmicos podem aparecer depois que o DOM inicial carrega.
      // Tentativas limitadas, sem contornar bloqueios nem fazer downloads.
      for (let attempt = 0; attempt < 4; attempt++) {
        const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
        capture = result?.result;
        if (capture?.urls?.length) break;
        if (attempt < 3) await delay(1400);
      }
      return { ok: true, data: capture };
    } finally { await chrome.tabs.remove(tab.id).catch(() => {}); }
  }
  if (message.action === 'uploadCover') {
    const configured = (await chrome.storage.local.get('acervoOrigin')).acervoOrigin;
    if (configured !== origin) throw new Error('Reconecte a extensão ao ACERVO.');
    const videoId = message.body?.videoId;
    if (typeof videoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(videoId))
      throw new Error('ID de filme inválido.');
    const cover = await getCoverData(message.body?.url);
    const tabId = await siteTab(origin, false);
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId }, world: 'ISOLATED', func: requestOnSite,
      args: [{ origin, operation: 'uploadCover', body: { videoId, ...cover } }]
    });
    return injected?.result || { ok: false, message: 'Não foi possível salvar a capa no ACERVO.' };
  }
  const configured = (await chrome.storage.local.get('acervoOrigin')).acervoOrigin;
  if (configured !== origin) throw new Error('O endereço mudou. Clique em Conectar.');
  if (['save', 'saveSeries', 'ensureSeason'].includes(message.action) && saving) throw new Error('Um envio já está em andamento. Aguarde o resultado.');
  if (['save', 'saveSeries', 'ensureSeason'].includes(message.action)) saving = true;
  try {
    if (message.action === 'save') await chrome.storage.session.set({ quickImportJob: { origin, status: 'pending', startedAt: Date.now(), title: message.body?.title || '' } });
    const tabId = await siteTab(origin, message.action === 'connect');
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', func: requestOnSite,
      args: [{ origin, operation: ['save', 'saveSeries', 'ensureSeason'].includes(message.action) ? message.action : 'options', ...(['save', 'saveSeries', 'ensureSeason'].includes(message.action) ? { body: message.body } : {}) }] });
    const response = result?.result || { ok: false, message: 'Não foi possível acessar a aba do ACERVO.' };
    if (message.action === 'save') await chrome.storage.session.set({ quickImportJob: { origin, status: response.ok ? 'done' : 'error', finishedAt: Date.now(), ...response } });
    return response;
  } catch (error) {
    if (message.action === 'save') await chrome.storage.session.set({ quickImportJob: { origin, status: 'error', finishedAt: Date.now(), ok: false, message: error.message } });
    throw error;
  } finally { if (['save', 'saveSeries', 'ensureSeason'].includes(message.action)) saving = false; }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !['popup.html', 'links.html', 'series-links.html'].some((page) => sender.url?.split('?')[0] === chrome.runtime.getURL(page))) return false;
  handleMessage(message).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
  return true; // Keep the response channel alive if the popup closes during a save.
});


const seriesPageMenuId = 'acervo-import-series-pages';
const contextMenuId = 'acervo-add-episode';
const seasonMenuId = 'acervo-import-season';
const movieMenuId = 'acervo-import-movies-v2';
function installContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: contextMenuId,
      title: 'Adicionar episódio (ACERVO V2)',
      contexts: ['link', 'page']
    });
    chrome.contextMenus.create({ id: seasonMenuId, title: 'Importar temporada (ACERVO V2)', contexts: ['page'] });
    chrome.contextMenus.create({ id: movieMenuId, title: 'Importar filmes desta página (ACERVO V2)', contexts: ['page'] });
    chrome.contextMenus.create({ id: seriesPageMenuId, title: 'Importar séries desta página', contexts: ['page'] });
  });
}
chrome.runtime.onInstalled.addListener(installContextMenu);

async function openContextForm(capture, error = '') {
  await chrome.storage.session.set({ contextCapture: { capture, error, openedAt: Date.now() } });
  await chrome.windows.create({
    url: chrome.runtime.getURL('popup.html?context=1'),
    type: 'popup',
    width: 430,
    height: 760,
    focused: true
  });
}
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === seriesPageMenuId) {
    let payload;
    try {
      if (!tab?.id || !/^https:/.test(tab.url || '')) throw new Error('Abra uma página HTTPS de séries.');
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['movies.js'] });
      payload = { entries: result?.result || [], sourcePage: tab.url };
    } catch (error) {
      payload = { entries: [], sourcePage: tab?.url || '', error: error.message };
    }
    await chrome.storage.session.set({ seriesPageCandidates: payload });
    await chrome.windows.create({
      url: chrome.runtime.getURL('series-links.html?context=1'),
      type: 'popup', width: 650, height: 760, focused: true
    });
    return;
  }

  if (info.menuItemId === movieMenuId) {
    let payload;
    try {
      if (!tab?.id) throw new Error('Não foi possível identificar a página de origem.');
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['movies.js'] });
      payload = { entries: result?.result || [], sourcePage: tab.url, error: '' };
    } catch (error) {
      payload = { entries: [], sourcePage: tab?.url || '', error: error.message };
    }
    await chrome.storage.session.set({ movieCapture: payload });
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html?movies=1'),
      type: 'popup', width: 500, height: 760, focused: true
    });
    return;
  }
  if (info.menuItemId === seasonMenuId) {
    try {
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['season.js'] });
      await chrome.storage.session.set({ seasonCapture: { entries: result?.result || [], sourcePage: tab.url } });
      await chrome.windows.create({ url: chrome.runtime.getURL('popup.html?season=1'), type: 'popup', width: 480, height: 760, focused: true });
    } catch (error) { await openContextForm({ urls: [], sourcePage: tab?.url || '' }, error.message); }
    return;
  }
  if (info.menuItemId !== contextMenuId) return;
  let temporaryTabId;
  try {
    let result;
    if (info.linkUrl) {
      const target = new URL(info.linkUrl);
      if (target.protocol !== 'https:' || target.username || target.password)
        throw new Error('O link do episódio precisa usar HTTPS.');
      const permission = `https://${target.hostname}/*`;
      if (!(await chrome.permissions.request({ origins: [permission] })))
        throw new Error('Permita o acesso a este site para a extensão localizar o player.');
      const opened = await chrome.tabs.create({ url: target.href, active: false });
      temporaryTabId = opened.id;
      await waitForTab(temporaryTabId, 'A página do episódio', 25000);
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId: temporaryTabId },
        files: ['extract.js']
      });
      result = injected?.result;
    } else {
      if (!tab?.id) throw new Error('Não encontrei a aba atual.');
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['extract.js']
      });
      result = injected?.result;
    }
    if (!result?.urls?.length)
      throw new Error('Não encontrei um player nesta página. Abra a página do episódio e tente novamente.');
    await openContextForm(result);
  } catch (error) {
    await openContextForm({ version: 1, title: '', description: '', urls: [], sourcePage: info.linkUrl || tab?.url || '' }, error.message);
  } finally {
    if (temporaryTabId) await chrome.tabs.remove(temporaryTabId).catch(() => {});
  }
});
