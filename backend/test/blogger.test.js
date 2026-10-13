import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { PGlite } from '@electric-sql/pglite';

process.env.DATABASE_URL = 'postgresql://unused:unused@localhost/blogger_test';
process.env.APP_ORIGIN = 'http://localhost:5173';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = await mkdtemp(path.join(os.tmpdir(), 'acervo-blogger-'));
const db = new PGlite();
await db.waitReady;
const { pool } = await import('../src/db.js');
const execute = async (sql, values = []) => {
  if (!values.length && sql.includes(';')) {
    const results = await db.exec(sql);
    return { ...results.at(-1), rowCount: results.at(-1)?.affectedRows || 0 };
  }
  const result = await db.query(sql, values);
  return { ...result, rowCount: result.affectedRows || result.rows.length };
};
pool.query = execute;
pool.connect = async () => ({ query: execute, release() {} });
const { migrate } = await import('../src/migrate.js');
// Simulate upgrading an installation with existing videos, not only a fresh DB.
await db.exec('CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter(n => n.endsWith('.sql') && n < '008').sort()) {
  await db.exec(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [name]);
}
const categoryId = randomUUID(), previousId = randomUUID();
await db.query("INSERT INTO categories(id,name) VALUES($1,'Blogger tests')", [categoryId]);
await db.query("INSERT INTO videos(id,title,category_id,storage_driver,source_type,provider_id,external_path,status,published) VALUES($1,'Existing',$2,'local','external','youtube','/embed/existing','ready',true)", [previousId, categoryId]);
const previousVideo = (await db.query('SELECT * FROM videos WHERE id=$1', [previousId])).rows[0];
const previousProviders = (await db.query('SELECT * FROM providers ORDER BY id')).rows;
await migrate();
await migrate(); // Re-running upgrades must not insert another provider.
const { createUser } = await import('../src/security.js');
const { resolveExternal, playbackUrl } = await import('../src/external.js');
const { buildApp } = await import('../src/app.js');
const app = await buildApp({ logger: false });
const password = 'Blogger-test-password-123';
const admin = await createUser({ name: 'Admin', email: 'blogger-admin@example.org', password, role: 'admin' });
const viewer = await createUser({ name: 'Viewer', email: 'blogger-viewer@example.org', password });
async function login(user) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login',
    headers: { origin: process.env.APP_ORIGIN }, payload: { email: user.email, password } });
  assert.equal(response.statusCode, 200);
  return { origin: process.env.APP_ORIGIN, cookie: 'acervo_session=' + response.cookies[0].value, 'x-csrf-token': response.json().csrf };
}
const adminHeaders = await login(admin), viewerHeaders = await login(viewer);
const fullUrl = 'https://www.blogger.com/video.g?token=TEST%2Bopaque%2Ftoken%3D&extra=keep%2Bexact#play';
const body = { title: 'Blogger test', externalUrl: fullUrl, contentType: 'movie', categoryId, published: true };
after(async () => {
  await app.close(); await pool.end(); await db.close();
  await rm(process.env.STORAGE_DIR, { recursive: true, force: true });
});

test('Blogger migration preserves existing providers/videos and is tracked once', async () => {
  assert.deepEqual((await db.query('SELECT * FROM videos WHERE id=$1', [previousId])).rows[0], previousVideo);
  assert.deepEqual((await db.query("SELECT * FROM providers WHERE id<>'blogger' ORDER BY id")).rows, previousProviders);
  const providers = (await db.query("SELECT * FROM providers WHERE id='blogger'")).rows;
  assert.equal(providers.length, 1);
  assert.equal(providers[0].name, 'Blogger Video');
});

test('Blogger import, duplicate detection, editing, complete URL and authenticated embed', async () => {
  const first = await app.inject({ method: 'POST', url: '/api/admin/quick-imports', headers: adminHeaders, payload: body });
  assert.equal(first.statusCode, 201, first.body);
  const id = first.json().id;
  const duplicate = await app.inject({ method: 'POST', url: '/api/admin/quick-imports', headers: adminHeaders, payload: body });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().id, id);
  assert.equal(duplicate.json().duplicate, true);
  const detail = await app.inject({ url: '/api/videos/' + id, headers: viewerHeaders });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.json().externalUrl, fullUrl);
  assert.equal(detail.json().providerName, 'Blogger Video');
  assert.equal(detail.json().sourceType, 'external');
  const playerUrl = detail.json().playerUrl;
  assert.equal((await app.inject({ url: playerUrl })).statusCode, 401);
  const player = await app.inject({ url: playerUrl, headers: viewerHeaders });
  assert.equal(player.statusCode, 200, player.body);
  assert.match(player.headers['content-security-policy'], /frame-src https:\/\/www\.blogger\.com;/);
  assert.match(player.body, /src="https:\/\/www\.blogger\.com\/video\.g\?token=TEST%2Bopaque%2Ftoken%3D&amp;extra=keep%2Bexact#play"/);
  assert.match(player.body, /sandbox="allow-scripts allow-same-origin allow-presentation"/);
  assert.match(player.body, /allow="autoplay; fullscreen; picture-in-picture; encrypted-media"/);
  const edit = await app.inject({ method: 'PUT', url: '/api/videos/' + id, headers: adminHeaders,
    payload: { title: 'Edited Blogger', categoryId, published: true, externalUrl: fullUrl.replace('TEST', 'UPDATED') } });
  assert.equal(edit.statusCode, 200, edit.body);
  assert.equal(edit.json().externalUrl, fullUrl.replace('TEST', 'UPDATED'));
  // Review importer uses the same provider validation and preserves the raw query.
  const review = await app.inject({ method: 'POST', url: '/api/admin/imports', headers: adminHeaders,
    payload: { title: 'Review', categoryId, contentType: 'movie', externalUrl: fullUrl } });
  assert.equal(review.statusCode, 201, review.body);
});

test('Blogger episodes use the existing sequential batch import flow', async () => {
  const series = await app.inject({ method: 'POST', url: '/api/series', headers: adminHeaders,
    payload: { title: 'Blogger series', categoryId, published: true } });
  assert.equal(series.statusCode, 201, series.body);
  const seasons = await app.inject({ url: '/api/series/' + series.json().id + '/seasons', headers: adminHeaders });
  const seasonId = seasons.json().items[0].id;
  for (let episodeNumber = 1; episodeNumber <= 2; episodeNumber++) {
    const response = await app.inject({ method: 'POST', url: '/api/admin/quick-imports', headers: adminHeaders,
      payload: { title: 'Blogger episode ' + episodeNumber, contentType: 'episode', seasonId,
        episodeNumber, published: true, externalUrl: 'https://www.blogger.com/video.g?token=episode' + episodeNumber } });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().episodeNumber, episodeNumber);
    assert.equal(response.json().seasonId, seasonId);
  }
});

test('Blogger rejects invalid URLs and retains authorization, CSRF and fixed origin', async () => {
  for (const url of [
    'https://www.blogger.com/video.g', 'https://www.blogger.com/video.g?token=',
    'https://www.blogger.com/video.g?token=%20', 'https://www.blogger.com/video.g?token=a&token=b',
    'https://www.blogger.com/video.g?token=a%0Ab', 'https://www.blogger.com/other?token=a',
    'https://www.blogger.com.evil.example/video.g?token=a', 'https://evil.example/video.g?token=a',
    'http://www.blogger.com/video.g?token=a', 'https://u:p@www.blogger.com/video.g?token=a',
    'https://www.blogger.com:8443/video.g?token=a', 'javascript:alert(1)',
  ]) await assert.rejects(resolveExternal(url), undefined, url);
  assert.throws(() => playbackUrl({ source_type: 'external', provider_kind: 'blogger',
    provider_origin: 'https://evil.example', external_path: '/video.g?token=test' }));
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/quick-imports', headers: viewerHeaders, payload: body })).statusCode, 403);
  assert.equal((await app.inject({ method: 'POST', url: '/api/admin/quick-imports', headers: { ...adminHeaders, 'x-csrf-token': '' }, payload: body })).statusCode, 403);
  const change = await app.inject({ method: 'PUT', url: '/api/admin/providers/blogger', headers: adminHeaders,
    payload: { baseUrl: 'https://evil.example', version: 1 } });
  assert.equal(change.statusCode, 400);
});

for (const folder of ['extension', 'extension-lotes']) {
  test(folder + ': recognizes Blogger iframe, lazy iframe and full opaque URL without requests', async () => {
    const script = await readFile(new URL('../../' + folder + '/extract.js', import.meta.url), 'utf8');
    const urls = [fullUrl, 'https://www.youtube.com/embed/test', 'https://player.vimeo.com/video/123',
      'https://redecanais.press/player3/server.php?vid=ABC',
      'https://www.blogger.com.evil.example/video.g?token=x', 'https://www.blogger.com/video.g?token=',
      'https://www.blogger.com/video.g?token=a&token=b', 'http://www.blogger.com/video.g?token=x',
      'https://www.blogger.com/video.g?token=a%0Ab', 'https://u:p@www.blogger.com/video.g?token=a',
      'https://www.blogger.com:8443/video.g?token=a'];
    const document = {
      title: 'Authorized video',
      querySelector: () => null,
      querySelectorAll: selector => selector.startsWith('iframe') ? urls.map((url, i) => ({
        tagName: 'IFRAME', getAttribute: key => key === (i ? 'src' : 'data-src') ? url : null
      })) : [],
    };
    const result = vm.runInNewContext(script, { document, location: { href: 'https://catalog.example/video' }, URL, atob });
    assert.deepEqual(Array.from(result.urls), urls.slice(0, 4));
    assert.equal(result.players[0].name, 'Blogger Video');
    assert.equal(result.players[0].url, fullUrl);
    const direct = vm.runInNewContext(script, { document: { ...document, querySelectorAll: () => [] },
      location: { href: fullUrl }, URL, atob });
    assert.equal(direct.urls[0], fullUrl);
  });
}
