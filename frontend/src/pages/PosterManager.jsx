import { useEffect, useState } from "react";
import { api, invalidate } from "../services/api";

const PAGE_SIZE = 12;
function makeRow(movie) {
  const suggested = String(movie.title).match(/\b(?:19|20)\d{2}\b/g)?.at(-1) || "";
  return { ...movie, searchTitle: movie.title, searchYear: String(movie.releaseYear || suggested),
    matches: [], selected: null, loading: false, saving: false, saved: false, error: "", note: "" };
}
export default function PosterManager() {
  const [rows, setRows] = useState([]);
  const [configured, setConfigured] = useState(null);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function patch(id, changes) {
    setRows((old) => old.map((row) => row.id === id ? { ...row, ...changes } : row));
  }
  async function load(page = offset) {
    setLoading(true); setError("");
    try {
      const [status, listing] = await Promise.all([
        api("/admin/tmdb/status"),
        api("/admin/tmdb/missing-posters?limit=" + PAGE_SIZE + "&offset=" + page)
      ]);
      setConfigured(status.configured);
      setTotal(listing.total);
      setRows(listing.items.map(makeRow));
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(offset); }, [offset]);

  async function search(row) {
    patch(row.id, { loading: true, error: "", note: "", matches: [], selected: null });
    try {
      const title = row.searchTitle.trim();
      if (title.length < 2) throw new Error("Digite um título de pelo menos 2 caracteres.");
      const params = new URLSearchParams({ title });
      const rawYear = row.searchYear.trim();
      if (rawYear) {
        const year = Number(rawYear);
        if (!Number.isInteger(year) || year < 1888 || year > 2100) throw new Error("Ano inválido.");
        params.set("year", String(year));
      }
      const result = await api("/admin/tmdb/search?" + params.toString());
      patch(row.id, { matches: result.results, note:
        result.fallbackWithoutYear ? "Nenhum resultado com esse ano. Mostrando filmes de outros anos." :
        result.results.length ? "" : "Nenhuma capa encontrada. Experimente alterar o título ou retirar o ano." });
    } catch (err) { patch(row.id, { error: err.message }); }
    finally { patch(row.id, { loading: false }); }
  }
  async function apply(row) {
    if (!row.selected || row.saving || row.saved) return;
    patch(row.id, { saving: true, error: "" });
    try {
      await api("/admin/tmdb/apply-poster", { method: "POST",
        body: { videoId: row.id, tmdbId: row.selected } });
      patch(row.id, { saved: true, matches: [], selected: null });
      invalidate();
    } catch (err) { patch(row.id, { error: err.message }); }
    finally { patch(row.id, { saving: false }); }
  }
  async function searchPage() {
    if (busy || configured !== true) return;
    setBusy(true);
    try { for (const row of rows) if (!row.saved && !row.loading) await search(row); }
    finally { setBusy(false); }
  }
  async function applySelected() {
    const approved = rows.filter((r) => r.selected && !r.saved);
    if (busy || !approved.length) return;
    if (!window.confirm("Aplicar " + approved.length + " capas escolhidas aos filmes?")) return;
    setBusy(true);
    try { for (const row of approved) await apply(row); }
    finally { setBusy(false); }
  }
  const approvedCount = rows.filter((r) => r.selected && !r.saved).length;
  return (
    <div className="tmdb-manager">
      <div className="section-title">
        <div>
          <p className="eyebrow">PÔSTERES VERTICAIS 2:3</p>
          <h1>Capas TMDB</h1>
          <p>Busque pelo título e ano, confira o pôster e aprove a imagem correta.</p>
        </div>
      </div>
      <p className="tmdb-intro">Inclui filmes antigos e novos importados pela extensão V2.
        Capas personalizadas existentes nunca são substituídas.</p>
      {configured === false && <p role="alert" className="form-error">
        TMDB não configurado. Defina TMDB_READ_ACCESS_TOKEN apenas no servidor.
      </p>}
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="tmdb-toolbar">
        <button type="button" className="button" onClick={() => load()} disabled={loading || busy}>Atualizar lista</button>
        <button type="button" className="button" onClick={searchPage}
          disabled={loading || busy || !rows.length || configured !== true}>
          {busy ? "Aguarde…" : "Buscar capas desta página"}
        </button>
        <button type="button" className="button button-accent" onClick={applySelected}
          disabled={loading || busy || approvedCount === 0}>
          Aplicar {approvedCount} capa{approvedCount === 1 ? "" : "s"} aprovada{approvedCount === 1 ? "" : "s"}
        </button>
      </div>
      {!loading && !rows.length && !error && <p className="empty-state">Nenhum filme sem capa encontrado.</p>}
      <div className="tmdb-list">
        {rows.map((row) => <article className="tmdb-item" key={row.id}>
          <div className="tmdb-item-heading">
            <h3>{row.title}</h3><small>{row.releaseYear || "Ano desconhecido"}</small>
          </div>
          <div className="tmdb-search-controls">
            <label>Título para buscar
              <input maxLength={160} value={row.searchTitle}
                onChange={(e) => patch(row.id, { searchTitle: e.target.value, matches: [], selected: null })} />
            </label>
            <label>Ano (opcional)
              <input type="number" min="1888" max="2100" value={row.searchYear}
                onChange={(e) => patch(row.id, { searchYear: e.target.value, matches: [], selected: null })} />
            </label>
            <button type="button" className="button" disabled={busy || row.loading || row.saving || row.saved || configured !== true}
              onClick={() => search(row)}>{row.loading ? "Buscando…" : "Buscar"}</button>
          </div>
          {row.note && <p className="tmdb-note">{row.note}</p>}
          {row.error && <p role="alert" className="form-error">{row.error}</p>}
          {row.saved && <p className="tmdb-saved">Pôster salvo com sucesso no ACERVO.</p>}
          {!!row.matches.length && !row.saved && (
            <div className="tmdb-choices" role="group" aria-label={"Pôsteres encontrados para " + row.title}>
              {row.matches.slice(0, 6).map((match) => (
                <button key={match.id} type="button"
                  aria-pressed={row.selected === match.id}
                  className={"tmdb-choice" + (row.selected === match.id ? " tmdb-choice-selected" : "")}
                  onClick={() => patch(row.id, { selected: match.id })}>
                  <img src={match.posterUrl} alt={"Pôster de " + match.title} loading="lazy" />
                  <strong>{match.title}</strong><small>{match.year || "Sem ano"}</small>
                </button>
              ))}
            </div>
          )}
          {row.selected && !row.saved && <button type="button" className="button button-accent"
            disabled={busy || row.saving} onClick={() => apply(row)}>
            {row.saving ? "Salvando…" : "Confirmar esta capa"}
          </button>}
        </article>)}
      </div>
      <nav className="tmdb-pagination" aria-label="Páginas de filmes sem capa">
        <button type="button" className="button" disabled={loading || busy || offset === 0}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Anterior</button>
        <span>{total ? offset + 1 : 0}–{Math.min(offset + PAGE_SIZE, total)} de {total}</span>
        <button type="button" className="button" disabled={loading || busy || offset + PAGE_SIZE >= total}
          onClick={() => setOffset(offset + PAGE_SIZE)}>Próxima</button>
      </nav>
      <div className="tmdb-credits">
        <a href="https://www.themoviedb.org/about/logos-attribution" target="_blank" rel="noopener noreferrer">
          TMDB — créditos e logotipos oficiais
        </a>
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </div>
    </div>
  );
}
