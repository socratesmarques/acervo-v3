import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor() { this.value = ''; this.textContent = ''; this.dataset = {}; this.children = [];
    this.disabled = false; this.checked = false; this.hidden = false; this.open = false; }
  replaceChildren(...children) { this.children = children; }
  append(child) { this.children.push(child); }
  add(child) { this.children.push(child); }
}
const nodes = Object.fromEntries([
  'status','start','retry','category','links','connect','refresh','published',
  'origin','connection','connection-label','open-site','results','progress'
].map(id => [id, new Element()]));
nodes.retry.hidden = true;
globalThis.Option = class { constructor(text, value) { this.text = text; this.value = value; } };
globalThis.document = {
  getElementById: id => { if (!nodes[id]) throw new Error('Elemento ausente: ' + id); return nodes[id]; },
  createElement: () => new Element(),
};
const storage = { acervoOrigin: 'https://acervo.example' };
const saved = [], captured = [], scanned = [];
let failThirdMovie = true;
globalThis.chrome = {
  storage: { local: {
    get: async key => ({ [key]: storage[key] }),
    set: async obj => { Object.assign(storage, obj); },
  } },
  permissions: { request: async () => true, contains: async () => true },
  runtime: { sendMessage: async ({ action, body }) => {
    if (action === 'options' || action === 'connect') return { ok: true,
      data: { userId: 'user-1', categories: [{ id: 'c1', name: 'Filmes' }] } };
    if (action === 'scanMoviePage') {
      scanned.push(body.url);
      return { ok: true, data: { kind: 'listing', entries:
        body.url.includes('/primeira') ? [
          { title: 'Filme Um', url: 'https://movies.example/um' },
          { title: 'Filme Dois', url: 'https://movies.example/dois' },
        ] : [
          { title: 'Filme Dois', url: 'https://movies.example/dois' },
          { title: 'Filme Três', url: 'https://movies.example/tres' },
        ] } };
    }
    if (action === 'capturePage') {
      captured.push(body.url);
      if (body.url.endsWith('/tres') && failThirdMovie)
        return { ok: false, message: 'Player temporariamente indisponível' };
      const token = body.url.split('/').at(-1);
      return { ok: true, data: { title: 'Filme ' + token, description: '',
        urls: ['https://www.blogger.com/video.g?token=' + token] } };
    }
    if (action === 'save') {
      saved.push(body);
      return { ok: true, data: { id: body.externalUrl, title: body.title,
        duplicate: body.title === 'Filme Dois', published: body.published } };
    }
    throw new Error('Ação inesperada: ' + action);
  } },
  tabs: { create: async () => ({}) },
};
await import('./links.js');
const waitFor = async predicate => {
  for (let i = 0; i < 260; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Tempo de teste excedido.');
};

test('a tela importa filmes de duas listas, continua após falha, ignora duplicados e permite repetir só o erro', async () => {
  await waitFor(() => !nodes.category.disabled);
  nodes.category.value = 'c1';
  nodes.category.onchange();
  nodes.links.value = 'https://movies.example/primeira\nhttps://movies.example/segunda';
  nodes.links.oninput();
  assert.equal(nodes.start.disabled, false);
  nodes.start.onclick();
  await waitFor(() => nodes.progress.textContent.includes('Páginas 2/2') && !nodes.start.disabled);
  assert.equal(scanned.length, 2);
  assert.equal(saved.length, 2); // Primeiro novo, segundo já cadastrado no servidor.
  assert.deepEqual(captured, [
    'https://movies.example/um', 'https://movies.example/dois', 'https://movies.example/tres'
  ]);
  assert.equal(saved[0].categoryId, 'c1');
  assert.equal(saved[0].published, false);
  assert.equal(saved[0].contentType, 'movie');
  const states = nodes.results.children.map(node => node.dataset.state);
  assert.equal(states.filter(x => x === 'saved').length, 1);
  assert.equal(states.filter(x => x === 'duplicate').length, 2);
  assert.equal(states.filter(x => x === 'error').length, 1);
  assert.equal(nodes.retry.hidden, false);

  failThirdMovie = false;
  nodes.retry.onclick();
  await waitFor(() => nodes.progress.textContent.includes('Páginas 1/1') && !nodes.start.disabled);
  assert.equal(scanned.length, 2); // A listagem inteira NÃO é reimportada.
  assert.equal(captured.filter(url => url.endsWith('/tres')).length, 2);
  assert.equal(saved.length, 3);
  assert.equal(nodes.retry.hidden, true);
  assert.match(nodes.status.textContent, /concluída/i);
});
