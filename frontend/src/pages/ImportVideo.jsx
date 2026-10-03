import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import useData from '../hooks/useData';
import Feedback from '../components/Feedback';

function readImport(hash) {
  if (!hash || hash.length > 80001) throw new Error('Abra esta tela pelo botão Enviar para ACERVO da extensão.');
  const data = JSON.parse(decodeURIComponent(hash.slice(1)));
  if (!data || data.version !== 1 || typeof data.title !== 'string' || data.title.length > 160 ||
      typeof data.externalUrl !== 'string' || data.externalUrl.length > 4096 ||
      typeof data.description !== 'string' || data.description.length > 10000)
    throw new Error('Os dados capturados estão incompletos ou inválidos. Capture novamente.');
  const url = new URL(data.externalUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('O player deve usar HTTPS, sem credenciais na URL.');
  return { title: data.title, description: data.description, externalUrl: url.href };
}
function ImportForm({ hash }) {
  const [initial] = useState(() => {
    try { return { data: readImport(hash) }; }
    catch (error) { return { error: error.message }; }
  });
  const categories = useData(signal => api('/categories', { signal }), []);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try { setResult(await api('/admin/imports', { method: 'POST', body })); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  if (initial.error) return <div className="empty-state"><h1>Importar vídeo externo</h1><p role="alert">{initial.error}</p><Link to="/admin/upload">Cadastrar manualmente</Link></div>;
  if (categories.loading || categories.error) return <Feedback {...categories} />;
  if (result) return <div className="empty-state"><h1>{result.duplicate ? 'Este player já está no acervo.' : 'Rascunho salvo.'}</h1><p>{result.duplicate ? 'O cadastro existente foi preservado.' : 'Você pode adicionar uma capa e publicar na edição.'}</p><Link className="button button-accent" to={`/admin/videos/${result.id}`}>Abrir cadastro</Link></div>;
  return <>
    <p className="eyebrow">ENVIAR PARA ACERVO</p><h1>Revise o conteúdo capturado.</h1>
    <p className="muted">O título veio da página de origem e pode ser corrigido. O vídeo será salvo como rascunho.</p>
    {!categories.data.items.length ? <div className="empty-state"><p>Crie uma categoria primeiro. Depois volte a esta aba e atualize a página.</p><Link to="/admin/categories" target="_blank" rel="noopener noreferrer">Criar categoria</Link></div> :
    <form className="form-stack upload-form" onSubmit={submit}><fieldset disabled={busy}>
      <label>Título<input name="title" required maxLength={160} defaultValue={initial.data.title} /></label>
      <input type="hidden" name="contentType" value="movie" /><p className="form-hint">Este player será salvo como vídeo. Para episódios, use o envio rápido da extensão. Para organizar uma série, <Link to="/admin/series/new">crie a série na aba Séries</Link>.</p>
      <label>Categoria<select name="categoryId" required defaultValue=""><option value="" disabled>Selecione uma categoria</option>{categories.data.items.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Descrição<textarea name="description" maxLength={10000} rows={5} defaultValue={initial.data.description} /></label>
      <label>URL do player<input type="url" name="externalUrl" required maxLength={4096} defaultValue={initial.data.externalUrl} /><span className="form-hint">O domínio será resolvido pelo provedor cadastrado. A capa pode ser adicionada após salvar.</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-accent" disabled={busy}>{busy ? 'Salvando…' : 'Salvar rascunho'}</button>
    </fieldset></form>}
  </>;
}

export default function ImportVideo() {
  const { hash } = useLocation();
  return <ImportForm key={hash} hash={hash} />;
}
