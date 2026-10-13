import test from 'node:test';
import assert from 'node:assert/strict';

// Integração simulada do service worker, sem abrir sites reais de terceiros.
const acervoOrigin = 'https://acervo.example';
let allowed = true, player = false, crash = false;
const opened = [], closed = [], injected = [];
globalThis.chrome = {
  permissions: { contains: async () => allowed },
  storage: { local: { get: async () => ({ acervoOrigin }) } },
  tabs: {
    create: async ({ url }) => { opened.push(url); return { id: 42, url, status: 'complete' }; },
    get: async () => ({ id: 42, url: 'https://example.com/filmes', status: 'complete' }),
    remove: async (id) => { closed.push(id); },
  },
  scripting: {
    executeScript: async ({ files, func }) => {
      if (func) return [{ result: 'complete' }];
      const name = files?.[0];
      injected.push(name);
      if (name === 'extract.js') return [{ result: player
        ? { title: 'Meu filme', urls: ['https://www.blogger.com/video.g?token=abc'] }
        : { title: 'Catálogo', urls: [] } }];
      if (name === 'movies.js') {
        if (crash) throw new Error('Script bloqueado pelo navegador');
        return [{ result: [
          { title: 'Filme Um', url: 'https://example.com/um' },
          { title: 'Filme Dois', url: 'https://example.com/dois' },
        ] }];
      }
      throw new Error('Arquivo inesperado: ' + name);
    }
  },
  runtime: {
    id: 'self',
    getURL: (file) => 'chrome-extension://self/' + file,
    onMessage: { addListener() {} },
    onInstalled: { addListener() {} },
  },
  contextMenus: { onClicked: { addListener() {} }, removeAll() {} },
};
const { handleMessage: main } = await import('./background.js');
const { handleMessage: lots } = await import('../extension-lotes/background.js');

for (const [label, worker] of [['principal', main], ['lotes', lots]]) {
  test(label + ': varre lista usando movies.js e fecha a aba temporária', async () => {
    player = false; crash = false; allowed = true; injected.length = 0;
    const result = await worker({ origin: acervoOrigin, action: 'scanMoviePage',
      body: { url: 'https://example.com/filmes' } });
    assert.equal(result.ok, true);
    assert.equal(result.data.kind, 'listing');
    assert.equal(result.data.entries.length, 2);
    assert.deepEqual(injected, ['extract.js', 'movies.js']);
    assert.equal(opened.length, closed.length);
  });
  test(label + ': reconhece página individual sem varrer catálogo', async () => {
    player = true; injected.length = 0;
    const result = await worker({ origin: acervoOrigin, action: 'scanMoviePage',
      body: { url: 'https://example.com/um' } });
    assert.equal(result.data.kind, 'movie');
    assert.equal(result.data.page.title, 'Meu filme');
    assert.deepEqual(injected, ['extract.js']);
    assert.equal(opened.length, closed.length);
    player = false;
  });
  test(label + ': recusa domínio não autorizado', async () => {
    allowed = false;
    const count = opened.length;
    await assert.rejects(worker({ origin: acervoOrigin, action: 'scanMoviePage',
      body: { url: 'https://example.com/filmes' } }), /Autorize/);
    assert.equal(opened.length, count);
    allowed = true;
  });
  test(label + ': fecha a aba também quando o detector falha', async () => {
    crash = true;
    await assert.rejects(worker({ origin: acervoOrigin, action: 'scanMoviePage',
      body: { url: 'https://example.com/filmes' } }), /Script bloqueado/);
    assert.equal(opened.length, closed.length);
    crash = false;
  });
}
