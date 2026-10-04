import { acervoOrigin, hostPattern } from './shared.js';
import { requestOnSite } from './bridge.js';
let saving = false;
async function waitForTab(id) {
  const initial = await chrome.tabs.get(id);
  if (initial.status === 'complete') return;
  await new Promise((resolve, reject) => {
    const finish = (error) => { clearTimeout(timer); chrome.tabs.onUpdated.removeListener(listener); error ? reject(error) : resolve(); };
    const listener = (tabId, change) => { if (tabId === id && change.status === 'complete') finish(); };
    const timer = setTimeout(() => finish(new Error('A aba do ACERVO demorou para abrir. Abra-a e tente novamente.')), 15000);
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(id).then((tab) => { if (tab.status === 'complete') finish(); }).catch(finish);
  });
}
async function siteTab(origin, create) {
  const pattern = hostPattern(origin);
  if (!(await chrome.permissions.contains({ origins: [pattern] }))) throw new Error('Clique em Conectar para autorizar apenas o endereço do seu ACERVO.');
  const tabs = await chrome.tabs.query({ url: pattern });
  let tab = tabs.find((tab) => { try { return new URL(tab.url).origin === origin; } catch { return false; } });
  if (!tab && create) tab = await chrome.tabs.create({ url: `${origin}/admin`, active: false });
  if (!tab) throw new Error('Abra uma aba do ACERVO ou clique em Conectar.');
  await waitForTab(tab.id);
  return tab.id;
}
export async function handleMessage(message) {
  const origin = acervoOrigin(message.origin);
  if (!['connect', 'options', 'save'].includes(message.action)) throw new Error('Operação inválida.');
  const configured = (await chrome.storage.local.get('acervoOrigin')).acervoOrigin;
  if (configured !== origin) throw new Error('O endereço mudou. Clique em Conectar.');
  if (message.action === 'save' && saving) throw new Error('Um envio já está em andamento. Aguarde o resultado.');
  if (message.action === 'save') saving = true;
  try {
    if (message.action === 'save') await chrome.storage.session.set({ quickImportJob: { origin, status: 'pending', startedAt: Date.now(), title: message.body?.title || '' } });
    const tabId = await siteTab(origin, message.action === 'connect');
    const [result] = await chrome.scripting.executeScript({ target: { tabId }, world: 'ISOLATED', func: requestOnSite,
      args: [{ origin, operation: message.action === 'save' ? 'save' : 'options', ...(message.action === 'save' ? { body: message.body } : {}) }] });
    const response = result?.result || { ok: false, message: 'Não foi possível acessar a aba do ACERVO.' };
    if (message.action === 'save') await chrome.storage.session.set({ quickImportJob: { origin, status: response.ok ? 'done' : 'error', finishedAt: Date.now(), ...response } });
    return response;
  } catch (error) {
    if (message.action === 'save') await chrome.storage.session.set({ quickImportJob: { origin, status: 'error', finishedAt: Date.now(), ok: false, message: error.message } });
    throw error;
  } finally { if (message.action === 'save') saving = false; }
}
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.url?.split('?')[0] !== chrome.runtime.getURL('popup.html')) return false;
  handleMessage(message).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
  return true; // Keep the response channel alive if the popup closes during a save.
});


const contextMenuId = 'acervo-add-episode';
function installContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: contextMenuId,
      title: 'Adicionar episódio ao ACERVO',
      contexts: ['link', 'page']
    });
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
      await waitForTab(temporaryTabId);
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
