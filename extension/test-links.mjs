import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLinkList as main } from './links-parse.mjs';
import { parseLinkList as lots } from '../extension-lotes/links-parse.mjs';

for (const [label, parse] of [['principal', main], ['lotes', lots]]) {
  test(label + ': extrai URLs e títulos definidos manualmente', () => {
    assert.deepEqual(parse('https://example.com/a\nFilme Dois | https://example.org/b\n'), [
      { url: 'https://example.com/a', title: '' },
      { url: 'https://example.org/b', title: 'Filme Dois' },
    ]);
  });
  test(label + ': ignora duplicados e fragmentos', () => {
    assert.equal(parse('https://example.com/a#x\nhttps://example.com/a#y').length, 1);
  });
  test(label + ': rejeita URL inválida e limite excedido', () => {
    assert.throws(() => parse('javascript:alert(1)'), /HTTPS/);
    assert.throws(() => parse('http://example.com/movie'), /HTTPS/);
    assert.throws(() => parse('https://user:pass@example.com/video'), /HTTPS/);
    assert.throws(() => parse('nao eh link'), /URL inválida|um link por linha/);
    assert.throws(() => parse(Array.from({ length: 51 }, (_, i) => 'https://example.com/' + i).join('\n')), /50/);
  });
}

import { expandMovieSource as expandMain } from './link-import.mjs';
import { expandMovieSource as expandLots } from '../extension-lotes/link-import.mjs';

for (const [label, expand] of [['principal', expandMain], ['lotes', expandLots]]) {
  test(label + ': uma página de catálogo gera vários filmes', () => {
    const source = { url: 'https://example.com/filmes/pagina-1', title: '' };
    const jobs = expand(source, { kind: 'listing', entries: [
      { title: 'Filme A', url: 'https://example.com/filme-a', coverUrl: 'https://img.example/a.jpg' },
      { title: 'Filme B', url: 'https://example.com/filme-b' },
      { title: 'Filme A repetido', url: 'https://example.com/filme-a#player' },
      { title: 'Outra origem', url: 'https://other.example/filme' },
      { title: 'Inseguro', url: 'http://example.com/filme' },
    ] });
    assert.deepEqual(jobs.map(({ url }) => url), ['https://example.com/filme-a', 'https://example.com/filme-b']);
    assert.equal(jobs[0].coverUrl, 'https://img.example/a.jpg');
  });
  test(label + ': respeita limite por catálogo, sem perder título', () => {
    const source = { url: 'https://example.com/list' };
    const entries = Array.from({ length: 150 }, (_, i) => ({ title: 'Filme ' + i, url: 'https://example.com/movie-' + i }));
    const result = expand(source, { kind: 'listing', entries });
    assert.equal(result.length, 120);
    assert.equal(result[0].title, 'Filme 0');
  });
  test(label + ': uma página individual usa título e player extraídos', () => {
    const capture = { kind: 'movie', page: { title: 'Título da página', urls: ['https://www.blogger.com/video.g?token=abc'] } };
    const [job] = expand({ url: 'https://example.com/filme-x', title: '' }, capture);
    assert.equal(job.title, 'Título da página');
    assert.deepEqual(job.page.urls, capture.page.urls);
    assert.equal(expand({ url: 'https://example.com/filme-x', title: 'Título manual' }, capture)[0].title, 'Título manual');
  });
  test(label + ': sem filme ou player, falha sem criar cadastro', () => {
    assert.throws(() => expand({ url: 'https://example.com/list' }, { kind: 'listing', entries: [] }), /Nenhum link/);
    assert.throws(() => expand({ url: 'https://example.com/movie' }, { kind: 'movie', page: { urls: [] } }), /Player/);
  });
}
