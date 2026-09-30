import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Upload,
  Film,
  Folder,
  Users,
  LayoutDashboard,
  RefreshCw,
  Globe,
} from "lucide-react";
import useData from "../hooks/useData";
import { api, upload } from "../services/api";
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
          <Link to={`/admin/videos/${v.id}`} key={v.id}>
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
    [busy, setBusy] = useState("");
  const state = useData(
    (signal) => api(`/admin/videos?limit=20&offset=${page * 20}`, { signal }),
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
        <h1>Vídeos</h1>
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
      {state.error || (!state.data && state.loading) ? (
        <Feedback {...state} />
      ) : (
        state.data && (
          <>
            <div className="table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
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
                          {v.status === "ready" && (
                            <Link to={`/video/${v.id}`}>Assistir</Link>
                          )}
                          <button
                            disabled={busy === v.id}
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
                              busy === v.id || v.status === "processing"
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
function VideoForm({ video, categories, maxUploadMB }) {
  const [sourceType, setSourceType] = useState(video?.sourceType || "upload");
  const navigate = useNavigate(),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState("");
  useEffect(() => {
    if (!busy) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      thumbnail = f.get("thumbnail");
    setBusy(true);
    setError("");
    setProgress(0);
    try {
      if (video) {
        await api(`/videos/${video.id}`, {
          method: "PUT",
          body: {
            ...(sourceType === "external" ? { externalUrl: f.get("externalUrl"), duration: Number(f.get("duration") || 0) } : {}),
            contentType: f.get("contentType"),
            title: f.get("title"),
            description: f.get("description"),
            categoryId: f.get("categoryId"),
            published: f.has("published"),
          },
        });
        if (thumbnail?.size) {
          const fd = new FormData();
          fd.append("thumbnail", thumbnail);
          await upload(`/videos/${video.id}/thumbnail`, fd, setProgress);
        }
      } else {
        const file = f.get("video");
        if (file?.size > maxUploadMB * 1024 * 1024)
          throw new Error(`O limite por vídeo é ${maxUploadMB} MB.`);
        f.set("sourceType", sourceType);
        f.set("published", String(f.has("published")));
        if (!thumbnail?.size) f.delete("thumbnail");
        await upload("/videos", f, setProgress);
      }
      navigate("/admin/videos");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{video ? "Editar vídeo" : "Um novo momento no acervo."}</h1>
      {!categories.length ? (
        <div className="empty-state">
          <p>Crie uma categoria antes de enviar vídeos.</p>
          <Link to="/admin/categories" className="button button-accent">
            Criar categoria
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="form-stack upload-form">
          <fieldset disabled={busy}>
            <label>
              Tipo de conteúdo
              <select name="contentType" defaultValue={video?.contentType || "movie"} required>
                <option value="movie">Filme</option>
                <option value="series">Série</option>
              </select>
            </label>
            <label>
              Origem do vídeo
              <select value={sourceType} disabled={!!video} onChange={(e) => setSourceType(e.target.value)}>
                <option value="upload">Upload de arquivo</option>
                <option value="external">Vídeo externo</option>
              </select>
            </label>
            {sourceType === "external" && <>
              <label>URL de incorporação
                <input type="url" name="externalUrl" required maxLength={4096} defaultValue={video?.externalUrl || ""} placeholder="https://www.youtube.com/embed/ID_DO_VIDEO" />
                <span className="form-hint">Cole somente a URL HTTPS do src do iframe. Gerencie os domínios em Admin → Provedores. Links de domínios anteriores cadastrados usam o endereço atual automaticamente.</span>
              </label>
              <label>Duração em segundos (opcional)
                <input type="number" name="duration" min="0" max="43200" step="1" defaultValue={video?.duration || ""} />
              </label>
            </>}
            <label>
              Título
              <input
                name="title"
                defaultValue={video?.title || ""}
                required
                maxLength={160}
              />
            </label>
            <label>
              Descrição
              <textarea
                name="description"
                defaultValue={video?.description || ""}
                maxLength={10000}
                rows={5}
              />
            </label>
            <label>
              Categoria
              <select
                name="categoryId"
                required
                defaultValue={video?.categoryId || ""}
              >
                <option value="" disabled>
                  Selecione uma categoria
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {!video && sourceType === "upload" && (
              <label className="file-drop">
                Arquivo de vídeo
                <input
                  type="file"
                  name="video"
                  accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/x-msvideo,.mkv,.m4v"
                  required
                />
                <span>Até {maxUploadMB} MB. MP4, MOV, MKV, WebM ou AVI.</span>
              </label>
            )}
            {(!video || video.status === "ready") && (
              <label>
                Thumbnail opcional
                <input
                  type="file"
                  name="thumbnail"
                  accept="image/jpeg,image/png,image/webp"
                />
                <span className="form-hint">
                  {sourceType === "external" ? "JPG, PNG ou WebP, até 10 MB. Sem imagem, usamos uma capa padrão." : "JPG, PNG ou WebP, até 10 MB. Sem imagem, geramos uma do vídeo."}
                </span>
              </label>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="published"
                defaultChecked={video?.published ?? true}
              />{" "}
              {sourceType === "external" ? "Publicar agora" : "Publicar quando o vídeo estiver pronto"}
            </label>
          </fieldset>
          {!video && sourceType === "upload" && (
            <p className="form-hint">
              Após o envio, o processamento continua no servidor. Acompanhe na
              página de vídeos. HLS gera qualidades até 1080p, respeitando a
              resolução original.
            </p>
          )}
          {busy && (
            <div role="status">
              <progress value={progress} max="100" />
              {progress < 100
                ? ` Enviando: ${progress}%`
                : " Upload enviado. Validando arquivo…"}
            </div>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button disabled={busy} className="button button-accent">
            {busy ? "Aguarde…" : video ? "Salvar alterações" : sourceType === "external" ? "Cadastrar vídeo externo" : "Enviar vídeo"}
          </button>
        </form>
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
  return (
    <VideoForm
      key={id}
      video={state.data.video}
      categories={state.data.categories.items}
    />
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
          ["/videos", "Vídeos", Film],
          ["/upload", "Enviar vídeo", Upload],
          ["/categories", "Categorias", Folder],
          ["/users", "Pessoas", Users],
          ["/providers", "Provedores", Globe],
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
          <Route path="categories" element={<Categories />} />
          <Route path="users" element={<UserList />} />
          <Route path="providers" element={<Providers />} />
          <Route
            path="*"
            element={<p>Página administrativa não encontrada.</p>}
          />
        </Routes>
      </section>
    </div>
  );
}
