export function acervoOrigin(value) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))))
    throw new Error('Informe somente a origem HTTPS do ACERVO (ou localhost para desenvolvimento).');
  return url.origin;
}
export function hostPattern(origin) {
  const url = new URL(acervoOrigin(origin));
  // Chrome host permissions do not distinguish ports; requests still check the exact origin.
  return `${url.protocol}//${url.hostname}/*`;
}
export function preferenceKey(origin, userId) { return `destination:${origin}:${userId}`; }
