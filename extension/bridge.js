// Copied by executeScript into an isolated world on the configured ACERVO tab only.
// Session cookie stays HttpOnly; CSRF is read and used inside that tab, never returned/stored.
export async function requestOnSite({ origin, operation, body }) {
  if (location.origin !== origin) return { ok: false, message: 'A aba mudou de endereço. Conecte novamente.' };
  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(15000), ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = response.status === 401 ? 'Entre como administrador na aba do ACERVO e conecte novamente.' : response.status === 403 ? 'Acesso negado. Confira sua conta administrativa e a sessão do ACERVO.' : response.status === 404 ? (data.message || 'Atualize o servidor do ACERVO para usar o envio rápido.') : data.issues?.map((i) => i.message).join(' · ') || data.message || 'Falha na API do ACERVO.';
      throw Object.assign(new Error(message), { status: response.status });
    }
    return data;
  }
  try {
    if (operation === 'options') {
      const data = await request('/api/admin/import-options');
      if (!Array.isArray(data.categories) || !Array.isArray(data.series) || !Array.isArray(data.seasons) || !data.userId)
        throw new Error('Resposta inesperada. Confira se o endereço abre seu ACERVO e se o servidor está atualizado.');
      return { ok: true, data };
    }
    if (operation !== 'save') throw new Error('Operação inválida.');
    const auth = await request('/api/auth/me');
    if (auth.user?.role !== 'admin' || typeof auth.csrf !== 'string') throw new Error('Entre como administrador no ACERVO.');
    const data = await request('/api/admin/quick-imports', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': auth.csrf }, body: JSON.stringify(body) });
    if (!data.id || typeof data.duplicate !== 'boolean') throw new Error('Resposta inesperada ao salvar. Confira o cadastro no painel.');
    // Refresh any open ACERVO UI that uses the existing catalog-change listener.
    window.dispatchEvent(new Event('catalog-change'));
    return { ok: true, data };
  } catch (error) {
    return { ok: false, status: error.status || 0, message: error.status ? error.message : `Sem confirmação do servidor: ${error.message}. Confira o painel; reenviar o mesmo player não cria outro cadastro.` };
  }
}
