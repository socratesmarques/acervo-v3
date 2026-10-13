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
