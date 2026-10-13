import test from 'node:test';
import assert from 'node:assert/strict';

class Element {
  constructor() {
    this.value=''; this.textContent=''; this.dataset={}; this.children=[];
    this.disabled=false; this.checked=false; this.hidden=false; this.open=false;
  }
  replaceChildren(...items) { this.children=items; }
  append(item) { this.children.push(item); }
  add(item) { this.children.push(item); }
}
const ids=['origin','status','start','retry','category','links','connect','refresh','published',
  'connection','connection-label','open-site','results','progress','covers','episode-hosts'];
const nodes=Object.fromEntries(ids.map(id => [id,new Element()]));
nodes.retry.hidden=true; nodes.covers.hidden=true; nodes['episode-hosts'].hidden=true;
globalThis.Option=class { constructor(text,value) { this.text=text;this.value=value; } };
globalThis.document={ getElementById: id => nodes[id],createElement: () => new Element() };
globalThis.location={ search:'' };
const storage={ acervoOrigin:'https://acervo.example' };
const calls=[];
let breakSecond=true, seriesExists=false;
const idSeries='11111111-1111-4111-8111-111111111111';
const idSeason='22222222-2222-4222-8222-222222222222';
const getPage=(url)=>url.endsWith('/list')
  ? { kind:'listing',entries:[{title:'Série Teste',url:'https://media.example/serie-1'}] }
  : { kind:'series',page:{title:'Série Teste',description:'Sinopse'},episodes:[
    {url:'https://media.example/ep1',number:1,seasonNumber:1,title:'Episódio 1',dubbed:true},
    {url:'https://media.example/ep2',number:2,seasonNumber:1,title:'Episódio 2',dubbed:true},
  ]};
globalThis.chrome={
  permissions:{request:async()=>true,contains:async()=>true},
  storage:{
    local:{get:async key=>({[key]:storage[key]}),set:async data=>Object.assign(storage,data)},
    session:{get:async()=>({}),remove:async()=>{}},
  },
  runtime:{sendMessage:async({action,body})=>{
    calls.push({action,body});
    if(action==='options')return {ok:true,data:{
      userId:'admin-1',categories:[{id:'category-1',name:'Animação'}]
    }};
    if(action==='scanSeriesPage')return {ok:true,data:getPage(body.url)};
    if(action==='capturePage') {
      if(breakSecond&&body.url.endsWith('ep2'))return {ok:true,data:{urls:[]}};
      return {ok:true,data:{urls:['https://www.blogger.com/video.g?token='+body.url.split('/').at(-1)]}};
    }
    if(action==='saveSeries') {
      const duplicate=seriesExists;seriesExists=true;
      return {ok:true,data:{id:idSeries,title:'Série Teste',duplicate,published:false}};
    }
    if(action==='ensureSeason')return {ok:true,data:{id:idSeason,number:1,duplicate:seriesExists}};
    if(action==='save')return {ok:true,data:{
      id:'33333333-3333-4333-8333-333333333333',title:body.title,
      duplicate:body.episodeNumber===1&&calls.filter(c=>c.action==='save'&&c.body.episodeNumber===1).length>1
    }};
    throw Error('Ação inesperada '+action);
  }},
  tabs:{create:async()=>({})},
};
await import('./series-links.js');
async function waitFor(check) {
  for(let i=0;i<250;i++){
    if(check())return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw Error('Tempo de teste excedido: '+nodes.progress.textContent+' '+nodes.status.textContent);
}
test('UI: importa série, registra erro parcial, reutiliza cadastro e repete apenas falha',async () => {
  await waitFor(()=>!nodes.category.disabled);
  nodes.category.value='category-1';nodes.category.onchange();
  nodes.links.value='https://media.example/list';nodes.links.oninput();
  assert.equal(nodes.start.disabled,false);
  nodes.start.onclick();
  await waitFor(()=>nodes.progress.textContent.startsWith('Páginas 1/1')&&!nodes.start.disabled);
  assert.equal(calls.filter(x=>x.action==='saveSeries').length,1);
  assert.equal(calls.filter(x=>x.action==='save').length,1);
  assert.equal(calls.find(x=>x.action==='saveSeries').body.published,false);
  assert.equal(calls.find(x=>x.action==='save').body.contentType,'episode');
  assert.equal(calls.find(x=>x.action==='save').body.seasonId,idSeason);
  assert.equal(nodes.retry.hidden,false);
  assert.equal(nodes.results.children.filter(x=>x.dataset.state==='error').length,2);
  breakSecond=false;
  nodes.retry.onclick();
  await waitFor(()=>nodes.progress.textContent.startsWith('Páginas 1/1')&&!nodes.start.disabled);
  assert.equal(calls.filter(x=>x.action==='scanSeriesPage'&&x.body.url.endsWith('/list')).length,1);
  assert.equal(calls.filter(x=>x.action==='saveSeries').length,2);
  assert.equal(calls.filter(x=>x.action==='save').length,3);
  assert.equal(nodes.retry.hidden,true);
  assert.match(nodes.status.textContent,/concluída/i);
});
