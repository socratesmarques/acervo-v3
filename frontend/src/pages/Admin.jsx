import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router-dom";
import {
  Upload,
  Film,
  Tv,
  Folder,
  Users,
  LayoutDashboard,
  RefreshCw,
  Globe,
} from "lucide-react";
import useData from "../hooks/useData";
import { api } from "../services/api";
import VideoForm from "../components/admin/VideoForm";
import { NewEpisode } from "../components/admin/SeriesManager";
import SeriesList, { NewSeries, EditSeries } from "./AdminSeries";
import AdminSettings from "./AdminSettings";
import ImportVideo from "./ImportVideo";
import Providers from "./Providers";
import Feedback from "../components/Feedback";
import { formatDate } from "../utils/format";
const statusLabel = {
  queued: "Na fila",
  processing: "Processando",
  ready: "Pronto",
  failed: "Falhou",
};
function Status({ video }) {
  return (
    <span className={`status status-${video.status}`}>
      {statusLabel[video.status]}
      {video.status === "ready"
        ? video.published
          ? " · Publicado"
          : " · Rascunho"
        : ""}
    </span>
  );
}
function Dashboard() {
  const state = useData(async (signal) => {
    const [stats, recent] = await Promise.all([
      api("/admin/stats", { signal }),
      api("/admin/videos?limit=5", { signal }),
    ]);
    return { stats, recent };
  }, []);
  if (state.loading || state.error) return <Feedback {...state} />;
  const { stats, recent } = state.data;
  return (
    <>
      <div className="section-title">
        <div>
          <p className="eyebrow">VISÃO GERAL</p>
          <h1>Seu acervo em números.</h1>
        </div>
        <Link to="/admin/upload" className="button button-accent">
          <Upload size={18} /> Enviar vídeo
        </Link>
      </div>
      <div className="stats-grid">
        {[
          ["Vídeos", stats.videos],
          ["Categorias", stats.categories],
          ["Visualizações", stats.views],
          ["Em processamento", stats.processing],
        ].map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <h2>Adicionados recentemente</h2>
      <div className="admin-recent">
        {recent.items.map((v) => (
          <Link to={`/admin/${v.contentType === "series" ? "series" : "videos"}/${v.id}`} key={v.id}>
            <div>
              <strong>{v.title}</strong>
              <p>
                {v.category} · {formatDate(v.createdAt)}
              </p>
            </div>
            <Status video={v} />
          </Link>
        ))}
        {!recent.items.length && (
          <p className="muted">Crie uma categoria e envie o primeiro vídeo.</p>
        )}
      </div>
    </>
  );
}
function VideoList() {
  const [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(""),
    [selected, setSelected] = useState({});
  const selectedIds = Object.keys(selected);
  const pageEligible = (statePlaceholder) => statePlaceholder?.items.filter((v) => v.status !== "processing") || [];
  const MAX_BULK = 100;
  const state = useData(
    (signal) => api(`/admin/videos?contentType=movie&limit=20&offset=${page * 20}`, { signal }),
    [page],
  );
  useEffect(() => {
    if (
      !state.data?.items.some((v) =>
        ["queued", "processing"].includes(v.status),
      )
    )
      return;
    const timer = setInterval(state.reload, 5000);
    return () => clearInterval(timer);
  }, [state.data, state.reload]);
  const eligible = pageEligible(state.data);
  const allPageSelected = eligible.length > 0 && eligible.every((v) => selected[v.id]);
  function toggleOne(video, checked) {
    if (checked && !selected[video.id] && selectedIds.length >= MAX_BULK) {
      setError("Você pode selecionar no máximo 100 filmes por exclusão.");
      return;
    }
    setError("");
    setSelected((current) => {
      const next = { ...current };
      if (checked) next[video.id] = video.title;
      else delete next[video.id];
      return next;
    });
  }
  function togglePage(checked) {
    const missing = eligible.filter((v) => !selected[v.id]);
    if (checked && selectedIds.length + missing.length > MAX_BULK) {
      setError("Limite de 100 filmes por exclusão. Exclua os selecionados antes de continuar.");
      return;
    }
    setError("");
    setSelected((current) => {
      const next = { ...current };
      for (const video of eligible) {
        if (checked) next[video.id] = video.title;
        else delete next[video.id];
      }
      return next;
    });
  }
  async function deleteSelected() {
    const ids = Object.keys(selected);
    if (!ids.length || busy) return;
    const examples = Object.values(selected).slice(0, 5).join(", ");
    if (!window.confirm(`Excluir permanentemente ${ids.length} filme(s) e seus arquivos?\n\n${examples}${ids.length > 5 ? " e outros…" : ""}\n\nHistóricos e favoritos desses filmes também serão apagados. Não é possível desfazer.`)) return;
    setBusy("bulk");
    setError("");
    setNotice("");
    try {
      const result = await api("/admin/bulk-delete", {
        method: "POST", body: { contentType: "movie", ids },
      });
      setSelected({});
      setNotice(`${result.deleted} filme(s) excluído(s). A limpeza dos arquivos foi agendada.`);
      const remaining = Math.max(0, (state.data?.total || 0) - result.deleted);
      if (page > 0 && page * 20 >= remaining) setPage(Math.max(0, Math.ceil(remaining / 20) - 1));
      else state.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  async function action(v, type) {
    if (
      type === "delete" &&
      !window.confirm(
        `Excluir “${v.title}” e seus arquivos? Essa ação não pode ser desfeita.`,
      )
    )
      return;
    setBusy(v.id);
    setError("");
    setNotice("");
    try {
      if (type === "delete") await api(`/videos/${v.id}`, { method: "DELETE" });
      if (type === "retry")
        await api(`/videos/${v.id}/retry`, { method: "POST" });
      if (type === "publish")
        await api(`/videos/${v.id}`, {
          method: "PUT",
          body: {
            title: v.title,
            description: v.description,
            categoryId: v.categoryId,
            published: !v.published,
          },
        });
      if (type === "delete") {
        setSelected((current) => {
          const next = { ...current };
          delete next[v.id];
          return next;
        });
      }
      state.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="section-title">
        <h1>Filmes e vídeos</h1>
        <div className="hero-buttons">
          <button className="button button-glass" onClick={state.reload}>
            <RefreshCw size={17} /> Atualizar
          </button>
          <Link className="button button-accent" to="/admin/upload">
            Enviar vídeo
          </Link>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status" className="muted">{notice}</p>}
      {state.data && <div className="bulk-toolbar" role="group" aria-label="Exclusão em massa de filmes">
        <strong>{selectedIds.length} selecionado(s)</strong>
        <span className="muted">Marque os filmes nesta página ou navegue para selecionar mais (máximo 100). Vídeos em processamento não podem ser selecionados.</span>
        <button type="button" className="button button-glass" disabled={!selectedIds.length || !!busy}
          onClick={() => { setSelected({}); setError(""); }}>Limpar seleção</button>
        <button type="button" className="button danger-bulk" disabled={!selectedIds.length || !!busy}
          onClick={deleteSelected}>{busy === "bulk" ? "Excluindo…" : `Excluir selecionados (${selectedIds.length})`}</button>
      </div>}
      {state.error || (!state.data && state.loading) ? (
        <Feedback {...state} />
      ) : (
        state.data && (
          <>
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>
                      <input type="checkbox" aria-label="Selecionar todos os filmes desta página"
                        checked={allPageSelected} disabled={!!busy || !eligible.length}
                        onChange={(e) => togglePage(e.target.checked)} />
                    </th>
                    <th>Vídeo</th>
                    <th>Status</th>
                    <th>Visualizações</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.items.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <input type="checkbox" aria-label={`Selecionar ${v.title}`}
                          checked={!!selected[v.id]} disabled={!!busy || v.status === "processing"}
                          onChange={(e) => toggleOne(v, e.target.checked)} />
                      </td>
                      <td>
                        <strong>{v.title}</strong>
                        <span>{v.contentType === "series" ? "Série" : "Filme"} · {v.category}{v.sourceType === "external" ? " · Vídeo externo" : ""}</span>
                        {v.processingError && (
                          <p className="form-error">{v.processingError}</p>
                        )}
                      </td>
                      <td>
                        <Status video={v} />
                      </td>
                      <td>{v.views}</td>
                      <td>
                        <div className="table-actions">
                          <Link to={`/admin/videos/${v.id}`}>Editar</Link>
                          {v.contentType === "series" && <Link to={`/admin/videos/${v.id}#temporadas`}>Temporadas e episódios</Link>}
                          {v.status === "ready" && (
                            <Link to={`/video/${v.id}`}>Assistir</Link>
                          )}
                          <button
                            disabled={!!busy}
                            onClick={() => action(v, "publish")}
                          >
                            {v.published ? "Despublicar" : "Publicar"}
                          </button>
                          {v.status === "failed" && (
                            <button
                              disabled={busy === v.id}
                              onClick={() => action(v, "retry")}
                            >
                              Reprocessar
                            </button>
                          )}
                          <button
                            className="danger-text"
                            disabled={
                              !!busy || v.status === "processing"
                            }
                            onClick={() => action(v, "delete")}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!state.data.items.length && (
                <p className="empty-state">Nenhum vídeo cadastrado.</p>
              )}
            </div>
            <div className="pagination">
              <button
                className="button button-glass"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <span>Página {page + 1}</span>
              <button
                className="button button-glass"
                disabled={(page + 1) * 20 >= state.data.total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        )
      )}
    </>
  );
}
function UploadPage() {
  const state = useData(async (signal) => {
    const [categories, stats] = await Promise.all([
      api("/categories", { signal }),
      api("/admin/stats", { signal }),
    ]);
    return { categories, stats };
  }, []);
  if (state.loading || state.error) return <Feedback {...state} />;
  return (
    <VideoForm
      categories={state.data.categories.items}
      maxUploadMB={state.data.stats.maxUploadMB}
    />
  );
}
function EditPage() {
  const { id } = useParams();
  const state = useData(
    async (signal) => {
      const [video, categories] = await Promise.all([
        api(`/videos/${id}`, { signal }),
        api("/categories", { signal }),
      ]);
      return { video, categories };
    },
    [id],
  );
  if (state.loading || state.error) return <Feedback {...state} />;
  if (state.data.video.contentType === "series") return <Navigate to={`/admin/series/${id}`} replace />;
  return (
    <>
      <VideoForm key={id} video={state.data.video} categories={state.data.categories.items} />

    </>
  );
}
function Categories() {
  const state = useData((signal) => api("/categories", { signal }), []),
    [editing, setEditing] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget,
      name = new FormData(form).get("name");
    setBusy(true);
    setError("");
    try {
      await api(`/categories${editing ? "/" + editing.id : ""}`, {
        method: editing ? "PUT" : "POST",
        body: { name },
      });
      form.reset();
      setEditing(null);
      state.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(c) {
    if (!window.confirm(`Excluir a categoria “${c.name}”?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/categories/${c.id}`, { method: "DELETE" });
      state.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Categorias</h1>
      <form className="inline-form" onSubmit={submit}>
        <label>
          {editing ? "Editar categoria" : "Nova categoria"}
          <input
            name="name"
            key={editing?.id || "new"}
            defaultValue={editing?.name || ""}
            required
            maxLength={80}
          />
        </label>
        <button disabled={busy} className="button button-accent">
          {editing ? "Salvar" : "Criar"}
        </button>
        {editing && (
          <button
            type="button"
            className="button button-glass"
            onClick={() => setEditing(null)}
          >
            Cancelar
          </button>
        )}
      </form>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {state.loading || state.error ? (
        <Feedback {...state} />
      ) : (
        <div className="admin-recent">
          {state.data.items.map((c) => (
            <div key={c.id}>
              <strong>{c.name}</strong>
              <div className="table-actions">
                <button onClick={() => setEditing(c)}>Editar</button>
                <button
                  disabled={busy}
                  className="danger-text"
                  onClick={() => remove(c)}
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="form-hint">
        Categorias usadas por vídeos precisam ser desvinculadas antes da
        exclusão.
      </p>
    </>
  );
}
function UserList() {
  const state = useData((signal) => api("/admin/users", { signal }), []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    const form = e.currentTarget,
      body = Object.fromEntries(new FormData(form));
    setBusy(true);
    setError("");
    try {
      await api("/admin/users", { method: "POST", body });
      form.reset();
      state.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Pessoas com acesso</h1>
      <form onSubmit={submit} className="form-stack narrow-form">
        <h2>Criar conta</h2>
        <label>
          Nome
          <input name="name" required minLength={2} maxLength={100} />
        </label>
        <label>
          E-mail
          <input name="email" type="email" required maxLength={254} />
        </label>
        <label>
          Senha inicial
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={200}
          />
        </label>
        <label>
          Permissão
          <select name="role">
            <option value="viewer">Espectador</option>
            <option value="admin">Administrador</option>
          </select>
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="button button-accent">
          {busy ? "Criando…" : "Criar conta"}
        </button>
      </form>
      {state.loading || state.error ? (
        <Feedback {...state} />
      ) : (
        <div className="admin-recent">
          {state.data.items.map((u) => (
            <div key={u.id}>
              <div>
                <strong>{u.name}</strong>
                <p>{u.email}</p>
              </div>
              <span>{u.role === "admin" ? "Administrador" : "Espectador"}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
export default function Admin() {
  return (
    <div className="admin-shell page-width">
      <aside className="admin-nav">
        <p className="eyebrow">ESTÚDIO ACERVO</p>
        {[
          ["", "Dashboard", LayoutDashboard],
          ["/videos", "Filmes e vídeos", Film],
          ["/series", "Séries", Tv],
          ["/upload", "Enviar vídeo", Upload],
          ["/categories", "Categorias", Folder],
          ["/users", "Pessoas", Users],
          ["/providers", "Provedores", Globe],
          ["/settings", "Configurações", Globe],
        ].map(([path, label, Icon]) => (
          <NavLink end={path === ""} key={path} to={`/admin${path}`}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </aside>
      <section className="admin-content">
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="videos" element={<VideoList />} />
          <Route path="videos/:id" element={<EditPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="series" element={<SeriesList />} />
          <Route path="series/new" element={<NewSeries />} />
          <Route path="series/:id" element={<EditSeries />} />
          <Route path="series/:seriesId/seasons/:seasonId/new" element={<NewEpisode />} />
          <Route path="categories" element={<Categories />} />
          <Route path="users" element={<UserList />} />
          <Route path="import" element={<ImportVideo />} />
          <Route path="providers" element={<Providers />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route
            path="*"
            element={<p>Página administrativa não encontrada.</p>}
          />
        </Routes>
      </section>
    </div>
  );
}
