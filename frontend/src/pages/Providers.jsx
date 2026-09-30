import { useState } from "react";
import useData from "../hooks/useData";
import { api } from "../services/api";
import Feedback from "../components/Feedback";
function ProviderForm({ provider, onSaved }) {
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e) {
    e.preventDefault();
    if (!window.confirm(`Trocar o domínio de ${provider.name} para ${baseUrl}? Isso afeta ${provider.videoCount} vídeo(s). Confirme que o endereço pertence ao provedor.`)) return;
    setBusy(true);
    setError("");
    try {
      const result = await api(`/admin/providers/${provider.id}`, { method: "PUT", body: { baseUrl, version: provider.version } });
      onSaved(result.message);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <article className="provider-entry">
    <h2>{provider.name}</h2>
    <p className="muted">{provider.videoCount} vídeo(s) vinculado(s)</p>
    <form onSubmit={save} className="form-stack">
      <label>Domínio de {provider.name}
        <input type="url" required maxLength={300} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} disabled={busy} />
      </label>
      <p className="form-hint">Somente https://dominio. Os caminhos e identificadores dos vídeos serão preservados.</p>
      {error && <p role="alert" className="form-error">{error}</p>}
      <button className="button button-accent" disabled={busy || baseUrl === provider.baseUrl}>{busy ? "Salvando…" : "Salvar domínio"}</button>
    </form>
    {provider.changes.length > 0 && <details><summary>Últimas alterações</summary>
      <ul className="provider-history">{provider.changes.map((change, index) => <li key={index}>
        <span>{change.oldUrl} → {change.newUrl}</span>
        <small>{new Date(change.createdAt).toLocaleString("pt-BR")}</small>
      </li>)}</ul>
    </details>}
  </article>;
}
export default function Providers() {
  const state = useData(signal => api("/admin/providers", { signal }), []);
  const [notice, setNotice] = useState("");
  if (!state.data || state.error) return <Feedback {...state} />;
  return <>
    <div className="section-title"><div><p className="eyebrow">FONTES EXTERNAS</p><h1>Provedores</h1></div>
      <button className="button button-glass" onClick={state.reload}>Atualizar</button>
    </div>
    <p className="muted">Altere o domínio uma vez para atualizar todos os vídeos desse provedor. Não é necessário reconstruir o site. Reabra os players que já estavam abertos.</p>
    <p className="form-hint">O novo domínio deve ser informado por você. O ACERVO não descobre nem verifica a propriedade do endereço automaticamente.</p>
    {notice && <p role="status">{notice}</p>}
    {state.data.items.map(provider => <ProviderForm key={`${provider.id}-${provider.version}`} provider={provider} onSaved={message => { setNotice(message); state.reload(); }} />)}
  </>;
}
