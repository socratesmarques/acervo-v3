import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandSeriesSource as original, normalizeSeriesEpisodes as normalizeOriginal } from './series-import.mjs';
import { expandSeriesSource as copies, normalizeSeriesEpisodes as normalizeCopies } from '../extension-lotes/series-import.mjs';

for (const [label, expand, normalize] of [
  ['principal', original, normalizeOriginal],
  ['lotes', copies, normalizeCopies],
]) {
  test(label + ': página de séries descobre cartões sem repetir ou sair do domínio', () => {
    const page = { url:'https://catalog.example/series/' };
    const found = expand(page, { kind:'listing', entries: [
      { title:'Série Um', url:'https://catalog.example/serie-um', coverUrl:'https://images.example/um.webp' },
      { title:'Série Um', url:'https://catalog.example/serie-um#capa' },
      { title:'Série Dois', url:'https://catalog.example/serie-dois' },
      { title:'Outro domínio', url:'https://other.example/serie' },
      { title:'Inseguro',url:'http://catalog.example/serie' },
    ] });
    assert.deepEqual(found.map(item => item.url),[
      'https://catalog.example/serie-um','https://catalog.example/serie-dois'
    ]);
    assert.equal(found[0].coverUrl,'https://images.example/um.webp');
  });
  test(label + ': série individual preserva capa e página original', () => {
    const scan = { kind:'series', page:{ title:'Série página',coverUrl:'https://images.example/s.webp' },
      episodes:[{ url:'https://series.example/ep1',number:1,dubbed:true }] };
    const [result] = expand({ url:'https://series.example/serie',title:'Título manual' },scan);
    assert.equal(result.title,'Título manual');
    assert.equal(result.capture,scan);
    assert.equal(result.coverUrl,'https://images.example/s.webp');
  });
  test(label + ': organiza temporadas e sagas sem colisão de episódios', () => {
    const entries = [
      { url:'https://series.example/ep-1',number:1,seasonNumber:1,dubbed:true,title:'Piloto' },
      { url:'https://series.example/ep-2',number:2,seasonNumber:1,dubbed:true },
      { url:'https://series.example/ep-1c',number:1,seasonNumber:1,dubbed:true },
      { url:'https://series.example/saga-1',number:1,seasonLabel:'Saga A',seasonNumber:null,dubbed:true },
      { url:'https://series.example/ep-3',number:1,seasonNumber:3,dubbed:true },
      { url:'http://series.example/insecure',number:10,seasonNumber:1,dubbed:true },
      { url:'https://series.example/sub',number:10,seasonNumber:1,dubbed:false },
      { url:'https://series.example/invalid',number:0,seasonNumber:1,dubbed:true },
    ];
    const episodes = normalize(entries);
    assert.equal(episodes.length,4);
    assert.deepEqual(episodes.map(e => [e.seasonNumber,e.number]),[[1,1],[1,2],[2,1],[3,1]]);
    assert.equal(episodes[0].title,'Piloto');
    assert.equal(episodes[2].seasonTitle,'Saga A');
  });
  test(label + ': rejeita séries vazias em páginas isoladas', () => {
    assert.throws(() => expand({url:'https://x.example/series'}, {kind:'listing',entries:[]}),/Nenhuma série/);
    assert.throws(() => expand({url:'https://x.example/serie'}, {kind:'series',episodes:[]}),/Nenhum episódio/);
    assert.deepEqual(normalize([{url:'https://x.example/ep',number:1,dubbed:false}]),[]);
  });
}
