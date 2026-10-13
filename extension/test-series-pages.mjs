import { test } from 'node:test';
import assert from 'node:assert/strict';

const origin = 'https://acervo.example';
let permission = true, direct = true, failure = false;
const called = [], opened = [], closed = [];
globalThis.chrome = {
  permissions: { contains: async () => permission },
  storage: { local: { get: async () => ({ acervoOrigin: origin }) } },
  tabs: {
    create: async ({ url }) => { opened.push(url); return { id: 51, url, status: 'complete' }; },
    get: async () => ({ id: 51, url: 'https://series.example/list', status: 'complete' }),
    remove: async (id) => { closed.push(id); },
  },
  scripting: { executeScript: async ({ files, func }) => {
    if (func) return [{ result: 'complete' }];
    const file = files[0]; called.push(file);
    if (failure && file === 'season.js') throw new Error('Script não autorizado');
    if (file === 'extract.js') return [{ result: {
      title: 'Minha Série', description: 'Sinopse', coverUrl: 'https://covers.example/poster.jpg', urls: []
    } }];
    if (file === 'season.js') return [{ result: direct
      ? [{ number:1,seasonNumber:1,url:'https://series.example/ep1',dubbed:true,title:'Episódio 1' }]
      : [] }];
    if (file === 'movies.js') return [{ result: [
      {title:'Série Alfa',url:'https://series.example/serie-alfa',coverUrl:'https://covers.example/alfa.jpg'},
      {title:'Série Beta',url:'https://series.example/serie-beta'},
    ] }];
    throw new Error('Injeção inesperada: ' + file);
  } },
  runtime: { id:'self',getURL: name => 'chrome-extension://self/'+name,
    onMessage:{addListener() {}}, onInstalled:{addListener() {}}
  },
  contextMenus: { onClicked:{addListener() {}},removeAll() {} },
};
const { handleMessage: main } = await import('./background.js');
const { handleMessage: lots } = await import('../extension-lotes/background.js');

for (const [label, worker] of [['principal', main], ['lotes', lots]]) {
  test(label + ': reconhece episódios em página individual e libera a aba',async () => {
    direct=true; failure=false; permission=true; called.length=0;
    const result=await worker({ origin,action:'scanSeriesPage',body:{url:'https://series.example/minha-serie'} });
    assert.equal(result.ok,true);
    assert.equal(result.data.kind,'series');
    assert.equal(result.data.episodes.length,1);
    assert.equal(result.data.page.coverUrl,'https://covers.example/poster.jpg');
    assert.deepEqual(called,['extract.js','season.js']);
    assert.equal(opened.length,closed.length);
  });
  test(label + ': identifica listas usando detector de cartões existente',async () => {
    direct=false; called.length=0;
    const result=await worker({ origin,action:'scanSeriesPage',body:{url:'https://series.example/list'} });
    assert.equal(result.data.kind,'listing');
    assert.equal(result.data.entries.length,2);
    assert.equal(called.at(-1),'movies.js');
    assert.equal(opened.length,closed.length);
  });
  test(label + ': recusa permissão ausente e links não HTTPS',async () => {
    permission=false; const old=opened.length;
    await assert.rejects(worker({origin,action:'scanSeriesPage',body:{url:'https://series.example/list'}}),/Autorize/);
    assert.equal(opened.length,old);
    permission=true;
    await assert.rejects(worker({origin,action:'scanSeriesPage',body:{url:'http://series.example/list'}}),/HTTPS|inválida/);
  });
  test(label + ': fecha aba no erro do detector de temporada',async () => {
    failure=true; direct=true;
    await assert.rejects(worker({origin,action:'scanSeriesPage',body:{url:'https://series.example/serie'}}),/Script não autorizado/);
    assert.equal(opened.length,closed.length);
    failure=false;
  });
}
