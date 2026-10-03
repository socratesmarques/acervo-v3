import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acervoOrigin, hostPattern } from '../../extension/shared.js';
import { requestOnSite } from '../../extension/bridge.js';
const origin = 'https://acervo.example';
let allowed = true, injection, records = {}, listener, responder = async () => ({ ok: true, data: { id: 'saved', duplicate: false } });
globalThis.chrome = {
  permissions: { contains: async () => allowed },
  storage: {
    local: { get: async () => ({ acervoOrigin: origin }) },
    session: { set: async (data) => { Object.assign(records, data); } },
  },
  tabs: { query: async () => [{ id: 1, url: `${origin}:444/admin` }, { id: 2, url: `${origin}/admin` }], get: async () => ({ status: 'complete' }) },
  scripting: { executeScript: async (args) => { injection = args; return [{ result: await responder() }]; } },
  runtime: { id: 'self', getURL: (file) => `chrome-extension://self/${file}`, onMessage: { addListener: (fn) => { listener = fn; } } },
};
const { handleMessage } = await import('../../extension/background.js');
test('extensão: permissões, origem exata, envio persistido e CSRF', async (t) => {
  await t.test('aceita apenas origem HTTPS ou desenvolvimento local', () => {
    assert.equal(acervoOrigin('https://acervo.example/'), origin);
    assert.equal(hostPattern('http://localhost:8080'), 'http://localhost/*');
    for (const url of ['http://public.example', 'https://u:p@acervo.example', 'https://acervo.example/path', 'javascript:alert(1)', 'https://acervo.example/?secret=x']) assert.throws(() => acervoOrigin(url));
  });
  await t.test('nega mensagens de páginas, origens trocadas e permissões ausentes', async () => {
    assert.equal(listener({ action: 'save' }, { id: 'self', url: origin }, () => {}), false);
    assert.equal(listener({ action: 'save' }, { id: 'other', url: 'chrome-extension://self/popup.html' }, () => {}), false);
    await assert.rejects(handleMessage({ origin: 'https://other.example', action: 'options' }), /endereço mudou/);
    allowed = false; await assert.rejects(handleMessage({ origin, action: 'save', body: {} }), /autorizar/);
    assert.equal(records.quickImportJob.status, 'error'); allowed = true;
  });
  await t.test('usa aba da origem exata e mundo isolado; salva resultado fora do popup', async () => {
    await handleMessage({ origin, action: 'save', body: { title: 'Episódio' } });
    assert.equal(injection.target.tabId, 2); assert.equal(injection.world, 'ISOLATED'); assert.equal(injection.func, requestOnSite);
    assert.equal(injection.args[0].operation, 'save'); assert.equal(records.quickImportJob.status, 'done');
    assert.equal(records.quickImportJob.data.id, 'saved');
  });
  await t.test('impede dois envios simultâneos no mesmo worker', async () => {
    let release;
    responder = () => new Promise((resolve) => { release = resolve; });
    const first = handleMessage({ origin, action: 'save', body: {} });
    await new Promise((resolve) => setImmediate(resolve));
    await assert.rejects(handleMessage({ origin, action: 'save', body: {} }), /andamento/);
    release({ ok: true, data: { id: 'saved', duplicate: false } }); await first;
  });
  await t.test('bridge nega navegação para outra origem antes de fazer requisição', async () => {
    globalThis.location = { origin: 'https://other.example' };
    assert.equal((await requestOnSite({ origin, operation: 'save', body: {} })).ok, false);
  });
  await t.test('bridge obtém CSRF na aba e só chama rotas fixas do ACERVO', async () => {
    globalThis.location = { origin };
    globalThis.window = { dispatchEvent() {} };
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => url === '/api/auth/me' ? { user: { role: 'admin' }, csrf: 'test-token' } : { id: 'result', duplicate: false } };
    };
    const result = await requestOnSite({ origin, operation: 'save', body: { title: 'Teste' } });
    assert.equal(result.ok, true);
    assert.deepEqual(calls.map((c) => c.url), ['/api/auth/me', '/api/admin/quick-imports']);
    assert.equal(calls[1].options.headers['X-CSRF-Token'], 'test-token');
    assert.equal(calls[1].options.credentials, 'same-origin'); assert.equal(calls[1].options.redirect, 'error');
    assert(!JSON.stringify(result).includes('test-token'));
  });
  await t.test('sessão expirada e rede indisponível não são exibidas como sucesso', async () => {
    globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    assert.equal((await requestOnSite({ origin, operation: 'save', body: {} })).status, 401);
    globalThis.fetch = async () => { throw new Error('Falha de rede'); };
    const result = await requestOnSite({ origin, operation: 'save', body: {} });
    assert.equal(result.ok, false); assert.match(result.message, /Sem confirmação/);
  });
});
