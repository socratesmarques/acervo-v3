import { acervoOrigin, hostPattern, preferenceKey } from './shared.js';
import { parseLinkList } from './links-parse.mjs';
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
    // A solicitação de permissão ocorre diretamente no clique.
    const allowed = await chrome.permissions.request({ origins: [hostPattern(target)] });
    if (!allowed) throw new Error('Autorize o endereço do ACERVO para conectar.');
    origin = target;
    await chrome.storage.local.set({ acervoOrigin: origin });
    await loadCategories('connect');
    status('Conectado. Escolha a categoria e cole os links.');
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
  return [...new Set(items.map((item) => {
    const url = new URL(item.url);
    return 'https://' + url.hostname + '/*';
  }))];
}
async function importBatch(items) {
  if (busy || !ready || !options?.categories.some((item) => item.id === $('category').value))
    return status('Escolha uma categoria válida e conecte ao ACERVO.', true);
  let grant;
  try {
    // Não executar nenhum await antes de permissions.request: Chrome exige gesto do usuário.
    grant = chrome.permissions.request({ origins: permissionPatterns(items) });
  } catch (error) { return status(error.message, true); }
  busy = true;
  buttons();
  $('retry').hidden = true;
  $('results').replaceChildren();
  failed = [];
  let countSaved = 0, countDuplicates = 0;
  const categoryId = $('category').value;
  const published = $('published').checked;
  try {
    if (!(await grant)) throw new Error('Permissão para acessar os links não concedida.');
    const key = preferenceKey(origin, options.userId);
    const data = (await chrome.storage.local.get(key))[key] || {};
    await chrome.storage.local.set({ [key]: { ...data, categoryId, published } });
    for (const [index, item] of items.entries()) {
      const row = document.createElement('li');
      row.textContent = 'Aguardando: ' + (item.title || item.url);
      $('results').append(row);
      $('progress').textContent = 'Processando ' + (index + 1) + ' de ' + items.length + '...';
      try {
        const page = await message('captureEpisode', { url: item.url });
        if (!page?.urls?.length) throw new Error('Player compatível não encontrado na página.');
        const title = (item.title || page.title || '').trim().slice(0, 160);
        if (!title) throw new Error('Título não encontrado. Use Nome do filme | URL.');
        const result = await message('save', {
          title, description: (page.description || '').slice(0, 10000),
          externalUrl: page.urls[0], contentType: 'movie', categoryId, published
        });
        if (result.duplicate) {
          countDuplicates++;
          row.dataset.state = 'duplicate';
          row.textContent = 'Já cadastrado (não alterado): ' + result.title;
        } else {
          countSaved++;
          row.dataset.state = 'saved';
          row.textContent = 'Salvo: ' + result.title;
        }
      } catch (error) {
        failed.push(item);
        row.dataset.state = 'error';
        row.textContent = 'Falhou (' + item.url + '): ' + error.message;
      }
      // A API permite até 60 cadastros por minuto.
      if (index < items.length - 1) await sleep(1400);
    }
    $('progress').textContent = countSaved + ' salvos · ' + countDuplicates + ' já cadastrados · ' + failed.length + ' falhas.';
    status(failed.length ? 'Confira as falhas abaixo. Você pode tentar só esses links novamente.' :
      'Importação concluída. Confira os filmes no painel do ACERVO.', failed.length > 0);
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
$('retry').onclick = () => {
  if (failed.length) importBatch([...failed]);
};
async function init() {
  const saved = (await chrome.storage.local.get('acervoOrigin')).acervoOrigin;
  origin = saved || '';
  $('origin').value = origin;
  $('connection').open = !origin;
  if (origin) {
    try { origin = acervoOrigin(origin); await loadCategories(); status('Cole seus links e escolha a categoria.'); }
    catch (error) { $('connection').open = true; status(error.message, true); }
  }
  buttons();
}
init().catch((error) => status(error.message, true));
