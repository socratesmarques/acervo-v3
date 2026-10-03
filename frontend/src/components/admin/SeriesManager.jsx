import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../services/api";
import useData from "../../hooks/useData";
import Feedback from "../Feedback";
import VideoForm from "./VideoForm";

export function NewEpisode() {
  const { seriesId, seasonId } = useParams();
  const state = useData(async (signal) => {
    const [series, seasons, categories, stats] = await Promise.all([
      api(`/videos/${seriesId}`, { signal }), api(`/series/${seriesId}/seasons`, { signal }),
      api("/categories", { signal }), api("/admin/stats", { signal }),
    ]);
    const season = seasons.items.find((s) => s.id === seasonId);
    if (!season) throw new Error("Temporada não encontrada.");
    return { series, season, categories, stats };
  }, [seriesId, seasonId]);
  if (state.loading || state.error) return <Feedback {...state} />;
  return <VideoForm key={seasonId} episodeContext={state.data} categories={state.data.categories.items} maxUploadMB={state.data.stats.maxUploadMB} />;
}

export default function SeriesManager({ series }) {
  const state = useData((signal) => api(`/series/${series.id}/seasons`, { signal }), [series.id]);
  const [selected, setSelected] = useState("");
  const [editing, setEditing] = useState(null);
  const [linking, setLinking] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const seasons = state.data?.items || [];
  const season = seasons.find((s) => s.id === selected) || seasons[0];
  useEffect(() => {
    if (!state.data?.items.some((s) => s.episodes.some((ep) => ["queued", "processing"].includes(ep.status)))) return;
    const timer = setInterval(state.reload, 5000);
    return () => clearInterval(timer);
  }, [state.data, state.reload]);
  async function run(action, message) {
    setBusy(true); setError(""); setNotice("");
    try { await action(); setNotice(message); state.reload(); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function saveSeason(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    run(async () => {
      const result = await api(editing ? `/seasons/${editing.id}` : `/series/${series.id}/seasons`, {
        method: editing ? "PUT" : "POST", body: { number: Number(f.get("number")), title: f.get("title") },
      });
      setSelected(result.id); setEditing(null);
    }, "Temporada salva.");
  }
  function linkEpisode(e) {
    e.preventDefault();
    const form = e.currentTarget, f = new FormData(form);
    const raw = f.get("videoId").trim();
    // Accept an ACERVO video/admin URL or UUID, never a provider URL here.
    const id = raw.match(/(?:^|\/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i)?.[1];
    if (!id) { setError("Cole o ID ou link de um vídeo já cadastrado no ACERVO."); return; }
    run(async () => {
      await api(`/episodes/${id}`, { method: "PUT", body: { seasonId: f.get("seasonId"), episodeNumber: Number(f.get("episodeNumber")) } });
      setSelected(f.get("seasonId")); setLinking(null); form.reset();
    }, "Episódio vinculado. O link, a publicação e o histórico foram preservados.");
  }
  function removeSeason() {
    if (!window.confirm(`Excluir a temporada ${season.number}? Somente temporadas vazias podem ser excluídas.`)) return;
    run(async () => { await api(`/seasons/${season.id}`, { method: "DELETE" }); setSelected(""); setEditing(null); }, "Temporada excluída.");
  }
  function removeEpisode(episode) {
    if (!window.confirm(`Excluir o episódio “${episode.title}” e seus arquivos? Esta ação não pode ser desfeita.`)) return;
    run(() => api(`/videos/${episode.id}`, { method: "DELETE" }), "Episódio excluído.");
  }
  function togglePublish(episode) {
    run(() => api(`/videos/${episode.id}`, { method: "PUT", body: {
      title: episode.title, description: episode.description, categoryId: episode.categoryId, published: !episode.published,
    } }), "Publicação atualizada.");
  }
  return <section id="temporadas" className="series-manager">
    <h2>Temporadas e episódios</h2>
    <button type="button" className="button button-glass" disabled={busy || state.loading} onClick={state.reload}>Atualizar episódios</button>
    <p className="muted">Crie uma temporada e adicione os episódios na ordem desejada. A série e seus episódios precisam estar publicados para aparecer aos espectadores.</p>
    <form className="inline-form" onSubmit={saveSeason} key={editing?.id || `new-${seasons.length}`}>
      <label>{editing ? "Número da temporada" : "Nova temporada"}
        <input name="number" type="number" min="1" max="1000" step="1" required defaultValue={editing?.number || Math.max(0, ...seasons.map((s) => s.number)) + 1} />
      </label>
      <label>Nome opcional<input name="title" maxLength={160} defaultValue={editing?.title || ""} placeholder="Ex.: Uma nova jornada" /></label>
      <button disabled={busy} className="button button-accent">{editing ? "Salvar temporada" : "Criar temporada"}</button>
      {editing && <button type="button" className="button button-glass" onClick={() => setEditing(null)}>Cancelar</button>}
    </form>
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {state.error ? <Feedback {...state} /> : state.loading ? <p role="status">Carregando temporadas…</p> : season ? <>
      <div className="section-title season-toolbar">
        <label>Temporada
          <select value={season.id} onChange={(e) => { setSelected(e.target.value); setLinking(null); }}>
            {seasons.map((s) => <option key={s.id} value={s.id}>Temporada {s.number}{s.title ? ` · ${s.title}` : ""}</option>)}
          </select>
        </label>
        <div className="table-actions">
          <button disabled={busy} onClick={() => setEditing(season)}>Editar temporada</button>
          <button disabled={busy || !!season.episodes.length} onClick={removeSeason} className="danger-text">Excluir temporada vazia</button>
          <Link className="button button-accent" to={`/admin/series/${series.id}/seasons/${season.id}/new`}>Adicionar episódio</Link>
        </div>
      </div>
      <div className="admin-recent">
        {season.episodes.map((ep) => <div key={ep.id}>
          <div><strong>{ep.episodeNumber}. {ep.title}</strong><p>{ep.status === "ready" ? (ep.published ? "Publicado" : "Rascunho") : ep.status === "failed" ? "Falha no processamento" : "Em processamento"}</p></div>
          <div className="table-actions">
            <Link to={`/admin/videos/${ep.id}`}>Editar episódio</Link>
            <Link to={`/video/${ep.id}`}>Assistir</Link>
            <button disabled={busy} onClick={() => setLinking(ep)}>Mover / renumerar</button>
            <button disabled={busy} onClick={() => togglePublish(ep)}>{ep.published ? "Despublicar" : "Publicar"}</button>
            {ep.status === "failed" && <button disabled={busy} onClick={() => run(() => api(`/videos/${ep.id}/retry`, { method: "POST" }), "Episódio enviado para a fila.")}>Reprocessar</button>}
            <button disabled={busy || ep.status === "processing"} onClick={() => removeEpisode(ep)} className="danger-text">Excluir episódio</button>
          </div>
        </div>)}
        {!season.episodes.length && <p className="empty-state">Esta temporada ainda não tem episódios.</p>}
      </div>
      <form className="form-stack narrow-form" onSubmit={linkEpisode} key={`${season.id}-${linking?.id || "link"}`}>
        <h3>{linking ? "Mover ou renumerar episódio" : "Vincular vídeo já cadastrado"}</h3>
        <p className="form-hint">Para aproveitar um vídeo importado com “Enviar para ACERVO”, copie o link dele no acervo e vincule abaixo. Para um link externo novo, use “Adicionar episódio”.</p>
        <label>Link ou ID do vídeo no ACERVO<input name="videoId" required defaultValue={linking?.id || ""} maxLength={4096} /></label>
        <label>Temporada<select name="seasonId" defaultValue={season.id}>{seasons.map((s) => <option key={s.id} value={s.id}>Temporada {s.number}</option>)}</select></label>
        <label>Número do episódio<input name="episodeNumber" type="number" min="1" max="10000" step="1" required defaultValue={linking?.episodeNumber || Math.max(0, ...season.episodes.map((ep) => ep.episodeNumber)) + 1} /></label>
        <button disabled={busy} className="button button-glass">{linking ? "Salvar organização" : "Vincular episódio"}</button>
        {linking && <button type="button" onClick={() => setLinking(null)} className="button button-glass">Cancelar</button>}
      </form>
    </> : <p className="empty-state">Crie a primeira temporada para começar.</p>}
  </section>;
}
