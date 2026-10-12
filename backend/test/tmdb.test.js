import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMovieTitle, yearSuggestion, tmdbPosterUrl, mapMovie } from '../src/tmdb-client.js';
test('limpeza do nome sem perder título', () => {
  assert.equal(normalizeMovieTitle('Unabomber (Dublado) - 2026 - 1080p'), 'Unabomber');
  assert.equal(normalizeMovieTitle('Interestelar (2014)'), 'Interestelar');
  assert.equal(normalizeMovieTitle('O Menino e a Garça'), 'O Menino e a Garça');
});
test('ano de lançamento pode ser ajustado', () => {
  assert.equal(yearSuggestion('Filme (Dublado) - 2026', 2019), 2019);
  assert.equal(yearSuggestion('Filme sem ano'), null);
  assert.equal(yearSuggestion('Filme - 2024 - 1080p'), 2024);
});
test('somente caminhos de pôsteres TMDB', () => {
  assert.equal(tmdbPosterUrl('/abc123.jpg'), 'https://image.tmdb.org/t/p/w500/abc123.jpg');
  assert.equal(tmdbPosterUrl('https://other.example/x.jpg'), null);
  assert.equal(tmdbPosterUrl('/../secret.jpg'), null);
  assert.equal(tmdbPosterUrl('/unsafe.svg'), null);
});
test('resultados sem capa são rejeitados', () => {
  assert.equal(mapMovie({ id: 1, title:'X', poster_path: null }), null);
  assert.equal(mapMovie({ id: 7, title:'X', poster_path: '/abc123.jpg', release_date:'2004-07-01' }).year,2004);
});
