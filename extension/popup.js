const $ = id => document.getElementById(id);
let captured = { description: '', sourcePage: '' };
let saved;
function status(text) { $('status').textContent = text; }
function acervoOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))))
    throw new Error('Informe somente a origem HTTPS do ACERVO (ou localhost para desenvolvimento).');
  return url.origin;
}
async function initialize() {
  const settings = await chrome.storage.local.get('acervoOrigin');
  $('origin').value = settings.acervoOrigin || '';
  saved = (await chrome.storage.session.get('filmMetadata')).filmMetadata;
  $('restore').hidden = !saved;
  $('forget').hidden = !saved;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https?:/.test(tab.url || '')) throw new Error('Abra a página do filme em uma aba normal.');
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] });
  captured = result.result;
  if (!captured?.urls) throw new Error('Não foi possível ler a página.');
  $('title').value = captured.title || '';
  for (const url of captured.urls) {
    const option = document.createElement('option');
    option.value = url; option.textContent = url;
    $('player').append(option);
  }
  $('send').disabled = captured.urls.length === 0;
  status(captured.urls.length ? (captured.title ? 'Nome preenchido automaticamente. Confira antes de enviar.' : 'Player encontrado. Informe o nome ou use os dados guardados da página do filme.') : 'Player não encontrado. Guarde o nome e abra a página com o código de incorporação.');
}
$('remember').onclick = async () => {
  const title = $('title').value.trim();
  if (!title) return status('Informe um nome para guardar.');
  saved = { title, description: (captured.description || '').slice(0, 10000), sourcePage: captured.sourcePage };
  await chrome.storage.session.set({ filmMetadata: saved });
  $('restore').hidden = false; $('forget').hidden = false;
  status('Nome guardado nesta sessão. Abra o Embed e clique em Usar nome guardado.');
};
$('restore').onclick = () => {
  if (!saved) return;
  $('title').value = saved.title;
  captured.description = saved.description;
  status('Nome guardado aplicado. Confira se corresponde ao player selecionado.');
};
$('forget').onclick = async () => {
  await chrome.storage.session.remove('filmMetadata'); saved = null;
  $('restore').hidden = true; $('forget').hidden = true; status('Dados guardados apagados.');
};
$('form').onsubmit = async event => {
  event.preventDefault();
  try {
    const origin = acervoOrigin($('origin').value.trim());
    const payload = { version: 1, title: $('title').value.trim(), description: (captured.description || '').slice(0, 10000), externalUrl: $('player').value };
    if (!payload.title || !payload.externalUrl) throw new Error('Confira o nome e o player.');
    const fragment = encodeURIComponent(JSON.stringify(payload));
    if (fragment.length > 80000) throw new Error('Dados muito longos. Use um título mais curto.');
    await chrome.storage.local.set({ acervoOrigin: origin });
    await chrome.tabs.create({ url: `${origin}/admin/import#${fragment}` });
    window.close();
  } catch (error) { status(error.message); }
};
initialize().catch(error => status(`Não foi possível capturar: ${error.message}`));
