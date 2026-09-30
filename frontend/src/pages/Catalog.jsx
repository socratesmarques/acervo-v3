import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import VideoCard from "../components/VideoCard";
import Feedback from "../components/Feedback";
import useData from "../hooks/useData";
import { api } from "../services/api";
export default function Catalog({ mode }) {
  const [params, setParams] = useSearchParams(),
    query = params.get("q") || "",
    category = params.get("categoria") || "",
    contentType = ["movie", "series"].includes(params.get("tipo")) ? params.get("tipo") : "";
  const page = Math.max(0, Number(params.get("pagina")) || 0),
    favorites = mode === "favorites",
    searchMode = mode === "search";
  const state = useData(
    async (signal) => {
      const filter = new URLSearchParams({
        ...(contentType ? { contentType } : {}),
        limit: 24,
        offset: page * 24,
        ...(query ? { q: query } : {}),
        ...(category ? { category } : {}),
      });
      const [videos, categories] = await Promise.all([
        api(`/${favorites ? "favorites" : "videos"}?${filter}`, { signal }),
        api("/categories", { signal }),
      ]);
      return { videos, categories };
    },
    [query, category, contentType, page, mode],
  );
  function search(e) {
    e.preventDefault();
    updateFilter("q", new FormData(e.currentTarget).get("q") || "");
  }
  function updateFilter(key, value) {
    const next = new URLSearchParams(params);
    next.delete("pagina");
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }
  function goPage(next) {
    const p = new URLSearchParams(params);
    p.set("pagina", next);
    setParams(p);
    window.scrollTo(0, 0);
  }
  return (
    <div className="page-width catalog-page">
      <p className="eyebrow">SEU ACERVO</p>
      <h1>
        {favorites
          ? "Minha lista"
          : searchMode
            ? "Encontre seu próximo play."
            : "Cada momento, um universo."}
      </h1>
      {searchMode && (
        <form className="catalog-search" onSubmit={search}>
          <Search />
          <input
            name="q"
            key={query}
            defaultValue={query}
            maxLength={120}
            aria-label="Termo da busca"
            placeholder="Título, descrição ou categoria"
            type="search"
          />
          <button className="button button-accent">Buscar</button>
        </form>
      )}
      <nav aria-label="Filtrar tipo de conteúdo" className="category-chips">
        {[["", "Todos"], ["movie", "Filmes"], ["series", "Séries"]].map(([value, label]) => (
          <button key={value} aria-pressed={contentType === value}
            className={`chip ${contentType === value ? "selected" : ""}`}
            onClick={() => updateFilter("tipo", value)}>{label}</button>
        ))}
      </nav>
      {!favorites && !searchMode && state.data && (
        <nav aria-label="Filtrar categorias" className="category-chips">
          <button
            className={`chip ${!category ? "selected" : ""}`}
            onClick={() => updateFilter("categoria", "")}
          >
            Todos
          </button>
          {state.data.categories.items.map((c) => (
            <button
              key={c.id}
              aria-pressed={category === c.id}
              className={`chip ${category === c.id ? "selected" : ""}`}
              onClick={() => updateFilter("categoria", c.id)}
            >
              {c.name}
            </button>
          ))}
        </nav>
      )}
      {state.loading || state.error ? (
        <Feedback {...state} />
      ) : (
        <>
          <p className="result-count" role="status">
            {state.data.videos.total} vídeos{query ? ` para “${query}”` : ""}
          </p>
          {state.data.videos.items.length ? (
            <div className="video-grid">
              {state.data.videos.items.map((v) => (
                <VideoCard key={v.id} video={v} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Nenhum vídeo por aqui.</h2>
              <p>
                {favorites
                  ? "Adicione vídeos à sua lista na página do player."
                  : "Tente outra busca ou categoria."}
              </p>
              <Link to="/categorias" className="button button-glass">
                Explorar acervo
              </Link>
            </div>
          )}
          <div className="pagination">
            <button
              className="button button-glass"
              disabled={!page}
              onClick={() => goPage(page - 1)}
            >
              Anterior
            </button>
            <span>Página {page + 1}</span>
            <button
              className="button button-glass"
              disabled={(page + 1) * 24 >= state.data.videos.total}
              onClick={() => goPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </div>
  );
}
