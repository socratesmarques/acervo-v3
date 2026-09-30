import { Link } from "react-router-dom";
import Hero from "../components/Hero";
import VideoRow from "../components/VideoRow";
import Feedback from "../components/Feedback";
import useData from "../hooks/useData";
import { api } from "../services/api";
import { useAuth } from "../context/useAuth";
export default function Home() {
  const { user } = useAuth();
  const state = useData(async (signal) => {
    const [recent, popular, history, favorites, categories] = await Promise.all(
      [
        api("/videos?limit=12", { signal }),
        api("/videos?sort=popular&limit=12", { signal }),
        api("/history?limit=12", { signal }),
        api("/favorites?limit=12", { signal }),
        api("/categories", { signal }),
      ],
    );
    const rows = await Promise.all(
      categories.items
        .slice(0, 4)
        .map(async (category) => ({
          ...category,
          ...(await api(`/videos?category=${category.id}&limit=12`, {
            signal,
          })),
        })),
    );
    return { recent, popular, history, favorites, categories, rows };
  }, []);
  if (state.loading || state.error) return <Feedback {...state} />;
  const { recent, popular, history, favorites, categories, rows } = state.data;
  if (!recent.items.length)
    return (
      <div className="page-width empty-state catalog-page">
        <p className="eyebrow">SEU ACERVO COMEÇA AQUI</p>
        <h1>Uma tela para suas histórias.</h1>
        <p>
          {user.role === "admin"
            ? "Crie uma categoria e envie seu primeiro vídeo."
            : "Os primeiros vídeos aparecerão aqui quando forem publicados."}
        </p>
        {user.role === "admin" && (
          <Link to="/admin/upload" className="button button-accent">
            Enviar primeiro vídeo
          </Link>
        )}
      </div>
    );
  return (
    <>
      <Hero video={recent.items[0]} />
      <div className="page-width home-content">
        <nav className="category-chips" aria-label="Explorar categorias">
          <span className="chip selected">Para você</span>
          {categories.items.map((c) => (
            <Link
              className="chip"
              key={c.id}
              to={`/categorias?categoria=${c.id}`}
            >
              {c.name}
            </Link>
          ))}
        </nav>
        <VideoRow
          title="Continue de onde parou"
          videos={history.items}
          showProgress
        />
        <VideoRow title="Novos no seu acervo" videos={recent.items} />
        <VideoRow title="Sua lista, seu momento" videos={favorites.items} />
        <VideoRow title="Os mais assistidos" videos={popular.items} />
        {rows.map((c) => (
          <VideoRow key={c.id} title={c.name} videos={c.items} />
        ))}
      </div>
    </>
  );
}
