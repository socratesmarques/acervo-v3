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
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html')) return false;
  handleMessage(message).then(sendResponse).catch((error) => sendResponse({ ok: false, message: error.message }));
  return true; // Keep the response channel alive if the popup closes during a save.
});
