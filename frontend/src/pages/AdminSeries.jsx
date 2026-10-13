import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Tv } from 'lucide-react';
import { api, upload } from '../services/api';
import useData from '../hooks/useData';
import Feedback from '../components/Feedback';
import SeriesManager from '../components/admin/SeriesManager';

function SeriesForm({ series, categories, onSaved }) {
  const navigate = useNavigate();
  const [createdId, setCreatedId] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    let id = series?.id || createdId;
    let metadataSaved = false;
    try {
      const body = { title: form.get('title'), description: form.get('description'), categoryId: form.get('categoryId'), published: form.has('published'),
        releaseYear: form.get('releaseYear') ? Number(form.get('releaseYear')) : null,
        episodeCoverDefault: form.has('episodeCoverDefault') };
      if (id) await api(`/series/${id}`, { method: 'PUT', body });
      else {
        const result = await api('/series', { method: 'POST', body: { ...body, firstSeason: form.has('firstSeason') } });
        id = result.id; setCreatedId(id);
      }
      metadataSaved = true;
      const file = form.get('thumbnail');
      if (file?.size) {
        const image = new FormData(); image.set('thumbnail', file);
        await upload(`/videos/${id}/thumbnail`, image, () => {});
      }
      if (onSaved) onSaved();
      else navigate(`/admin/series/${id}`);
    } catch (e) {
      setError(metadataSaved ? `Os dados da série foram salvos, mas não foi possível concluir: ${e.message}` : e.message);
    } finally { setBusy(false); }
  }
  if (!categories.length) return <div className="empty-state"><p>Crie uma categoria para organizar suas séries.</p><Link className="button button-accent" to="/admin/categories">Criar categoria</Link></div>;
  return <form onSubmit={submit} className="form-stack upload-form">
    <fieldset disabled={busy}>
      <label>Nome da série<input name="title" required maxLength={160} defaultValue={series?.title || ''} /></label>
      <label>Descrição<textarea name="description" rows={3} maxLength={10000} defaultValue={series?.description || ''} /></label>
      <label>Ano de exibição (opcional)<input name="releaseYear" type="number" min="1888" max="2100" step="1" defaultValue={series?.releaseYear ?? ""} placeholder="Ex.: 2024" /></label>
      <label>Categoria<select name="categoryId" required defaultValue={series?.categoryId || ''}><option value="" disabled>Selecione uma categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {(!series || series.status === 'ready') && <label>Capa da série (opcional)<input type="file" name="thumbnail" accept="image/jpeg,image/png,image/webp" /><span className="form-hint">JPG, PNG ou WebP, até 10 MB.</span></label>}
      <label className="checkbox-label"><input type="checkbox" name="episodeCoverDefault" defaultChecked={series?.episodeCoverDefault ?? true} />Usar a capa da série como padrão nos episódios sem capa personalizada</label>
      {!series && !createdId && <label className="checkbox-label"><input type="checkbox" name="firstSeason" defaultChecked />Criar temporada 1 automaticamente</label>}
      <label className="checkbox-label"><input type="checkbox" name="published" defaultChecked={series?.published ?? true} />Publicar a série no catálogo</label>
    </fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" className="muted">{notice}</p>}
    {state.data && <div className="bulk-toolbar" role="group" aria-label="Exclusão em massa de séries">
      <label className="bulk-check">
        <input type="checkbox" aria-label="Selecionar todas as séries desta página"
          checked={allPageSelected} disabled={!!busy || !eligible.length}
          onChange={(e) => togglePage(e.target.checked)} />
        Selecionar todas desta página
      </label>
      <strong>{selectedIds.length} selecionada(s)</strong>
      <span className="muted">Você pode selecionar séries em páginas diferentes (máximo 100).</span>
      <button type="button" className="button button-glass" disabled={!selectedIds.length || !!busy}
        onClick={() => { setSelected({}); setError(''); }}>Limpar seleção</button>
      <button type="button" className="button danger-bulk" disabled={!selectedIds.length || !!busy}
        onClick={deleteSelected}>{busy === 'bulk' ? 'Excluindo…' : `Excluir selecionadas (${selectedIds.length})`}</button>
    </div>}

    <button disabled={busy} className="button button-accent">{busy ? 'Salvando…' : series ? 'Salvar dados da série' : createdId ? 'Concluir cadastro' : 'Criar série'}</button>
    {createdId && error && <Link to={`/admin/series/${createdId}`}>Ir para a série já criada</Link>}
  </form>;
}
export function NewSeries() {
  const state = useData((signal) => api('/categories', { signal }), []);
  if (state.loading || state.error) return <Feedback {...state} />;
  return <><Link className="back-link" to="/admin/series">Voltar às séries</Link><p className="eyebrow">NOVA SÉRIE</p><h1>Uma série, várias histórias.</h1><p className="muted series-intro">Crie a série e organize as temporadas. Os links e arquivos entram em cada episódio.</p><SeriesForm categories={state.data.items} /></>;
}
export function EditSeries() {
  const { id } = useParams();
  const [notice, setNotice] = useState('');
  const state = useData(async (signal) => {
    const [series, categories] = await Promise.all([api(`/videos/${id}`, { signal }), api('/categories', { signal })]);
    if (series.contentType !== 'series') throw new Error('Série não encontrada.');
    return { series, categories: categories.items };
  }, [id]);
  if (state.loading || state.error) return <Feedback {...state} />;
  const { series, categories } = state.data;
  return <>
    <Link className="back-link" to="/admin/series">Voltar às séries</Link>
    <div className="section-title"><div><p className="eyebrow">GERENCIAR SÉRIE</p><h1>{series.title}</h1><p className="muted">{series.category} · {series.published ? 'Publicada' : 'Rascunho'}</p></div><Link className="button button-glass" to={`/video/${id}`}>Ver no catálogo</Link></div>
    {notice && <p role="status">{notice}</p>}
    <details className="series-metadata"><summary>Editar ano, nome, descrição e capa dos episódios</summary><SeriesForm series={series} categories={categories} onSaved={() => { setNotice('Dados da série atualizados.'); state.reload(); }} /></details>
    <SeriesManager key={id} series={series} />
  </>;
}
export default function SeriesList() {
  const [page, setPage] = useState(0), [q, setQuery] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState({});
  const selectedIds = Object.keys(selected);
  const MAX_BULK = 100;
  const state = useData((signal) => api(`/admin/series?limit=20&offset=${page * 20}&q=${encodeURIComponent(q)}`, { signal }), [page, q]);
  const eligible = state.data?.items.filter((series) => series.status !== 'processing') || [];
  const allPageSelected = eligible.length > 0 && eligible.every((series) => !!selected[series.id]);
  function toggleOne(series, checked) {
    if (checked && !selected[series.id] && selectedIds.length >= MAX_BULK)
      return setError('Limite de 100 séries por exclusão.');
    setError('');
    setSelected((current) => {
      const next = { ...current };
      if (checked) next[series.id] = { title: series.title, seasons: series.seasonCount, episodes: series.episodeCount };
      else delete next[series.id];
      return next;
    });
  }
  function togglePage(checked) {
    const missing = eligible.filter((series) => !selected[series.id]);
    if (checked && selectedIds.length + missing.length > MAX_BULK)
      return setError('Limite de 100 séries. Exclua a seleção antes de adicionar mais.');
    setError('');
    setSelected((current) => {
      const next = { ...current };
      for (const series of eligible) {
        if (checked) next[series.id] = { title: series.title, seasons: series.seasonCount, episodes: series.episodeCount };
        else delete next[series.id];
      }
      return next;
    });
  }
  async function deleteSelected() {
    const ids = Object.keys(selected);
    if (!ids.length || busy) return;
    const values = Object.values(selected);
    const seasons = values.reduce((sum, item) => sum + item.seasons, 0);
    const episodes = values.reduce((sum, item) => sum + item.episodes, 0);
    const preview = values.slice(0, 5).map((item) => item.title).join(', ');
    if (!window.confirm(`Excluir permanentemente ${ids.length} série(s), incluindo aproximadamente ${seasons} temporada(s) e ${episodes} episódio(s)?\n\n${preview}${ids.length > 5 ? ' e outras…' : ''}\n\nOs arquivos, históricos e favoritos também serão removidos. Essa ação não pode ser desfeita.`)) return;
    setBusy('bulk'); setError(''); setNotice('');
    try {
      const result = await api('/admin/bulk-delete', {
        method: 'POST', body: { contentType: 'series', ids },
      });
      setSelected({});
      setNotice(`${result.deleted} série(s), ${result.seasonsDeleted} temporada(s) e ${result.episodesDeleted} episódio(s) excluídos. A limpeza dos arquivos foi agendada.`);
      const remaining = Math.max(0, (state.data?.total || 0) - result.deleted);
      if (page > 0 && page * 20 >= remaining) setPage(Math.max(0, Math.ceil(remaining / 20) - 1));
      else state.reload();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function action(series, remove) {
    if (remove && !window.confirm(`Excluir definitivamente “${series.title}”, ${series.seasonCount} temporada(s) e ${series.episodeCount} episódio(s)? Os históricos e favoritos desses itens também serão apagados.`)) return;
    setBusy(series.id); setError(''); setNotice('');
    try {
      if (remove) await api(`/series/${series.id}`, { method: 'DELETE' });
      else await api(`/series/${series.id}`, { method: 'PUT', body: { title: series.title, description: series.description, categoryId: series.categoryId, published: !series.published } });
      if (remove) setSelected((current) => { const next = { ...current }; delete next[series.id]; return next; });
      if (remove && page && state.data.items.length === 1) setPage(page - 1);
      else state.reload();
    } catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  return <>
    <div className="section-title"><div><p className="eyebrow">SEU CATÁLOGO</p><h1>Séries</h1></div><Link to="/admin/series/new" className="button button-accent"><Plus size={18} />Nova série</Link></div>
    <p className="muted series-intro">Organize suas séries, temporadas e episódios em um só lugar.</p>
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); setQuery(new FormData(e.currentTarget).get('q').trim()); setPage(0); }}><label>Buscar séries<input type="search" name="q" maxLength={120} placeholder="Nome, descrição ou categoria" /></label><button className="button button-glass">Buscar</button></form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {state.loading || state.error ? <Feedback {...state} /> : <>
      <div className="admin-series-grid">{state.data.items.map((series) => <article key={series.id} className="admin-series-card">
        <label className="series-bulk-check"><input type="checkbox" checked={!!selected[series.id]}
          aria-label={`Selecionar série ${series.title}`} disabled={!!busy || series.status === "processing"}
          onChange={(e) => toggleOne(series, e.target.checked)} /> Selecionar série</label>
        <Link to={`/admin/series/${series.id}`} className={`admin-series-cover${series.posterVertical ? " portrait" : ""}`} aria-label={`Gerenciar ${series.title}`}><img src={series.thumbnail} alt="" loading="lazy" /><Tv size={22} aria-hidden="true" /></Link>
        <div className="admin-series-info"><h2><Link to={`/admin/series/${series.id}`}>{series.title}</Link></h2><p>{series.seasonCount} temporada(s) · {series.episodeCount} episódio(s)</p><p className="muted">{series.category} · {series.published ? 'Publicada' : 'Rascunho'}</p>
          <Link className="button button-accent" to={`/admin/series/${series.id}`}>Gerenciar temporadas</Link>
          <div className="table-actions"><button disabled={!!busy} onClick={() => action(series, false)}>{series.published ? 'Despublicar' : 'Publicar'}</button><button className="danger-text" disabled={busy === series.id} title="Excluir série, temporadas e episódios" onClick={() => action(series, true)}>Excluir série inteira</button></div>
        </div>
      </article>)}</div>
      {!state.data.items.length && <div className="empty-state"><Tv size={36} /><h2>{q ? 'Nenhuma série encontrada.' : 'Crie sua primeira série.'}</h2><p>Ela começa com nome e categoria. Depois você adiciona os episódios.</p><Link className="button button-accent" to="/admin/series/new">Criar série</Link></div>}
      {state.data.total > 20 && <div className="pagination"><button className="button button-glass" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page + 1}</span><button className="button button-glass" disabled={(page + 1) * 20 >= state.data.total} onClick={() => setPage(page + 1)}>Próxima</button></div>}
    </>}
  </>;
}
