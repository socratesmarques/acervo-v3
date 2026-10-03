import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, upload } from "../../services/api";
export default function VideoForm({ video, categories, maxUploadMB, episodeContext }) {
  const [contentType, setContentType] = useState(video?.contentType || (episodeContext ? "episode" : "movie"));
  const [selectedSource, setSourceType] = useState(video?.sourceType || (episodeContext ? "external" : "upload"));
  const sourceType = !video && contentType === "series" ? "collection" : selectedSource;
  const seriesId = episodeContext?.series.id || video?.seriesId;
  const returnPath = seriesId ? `/admin/videos/${seriesId}` : "/admin/videos";
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
        const created = await upload("/videos", f, setProgress);
        if (contentType === "series") {
          navigate(`/admin/videos/${created.id}`);
          return;
        }
      }
      navigate(returnPath);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>{contentType === "episode" ? (video ? "Editar episódio" : "Novo episódio") : video ? "Editar vídeo" : "Um novo momento no acervo."}</h1>
      {seriesId && <Link className="back-link" to={returnPath}>Voltar às temporadas da série</Link>}
      {episodeContext && <p className="muted">{episodeContext.series.title} · Temporada {episodeContext.season.number}</p>}
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
            {contentType === "episode" ? (
              <input type="hidden" name="contentType" value="episode" />
            ) : (
              <label>Tipo de conteúdo
                <select name="contentType" value={contentType} onChange={(e) => setContentType(e.target.value)} required>
                  {sourceType !== "collection" || !video ? <option value="movie">Filme</option> : null}
                  <option value="series">Série</option>
                </select>
              </label>
            )}
            {episodeContext && <>
              <input type="hidden" name="seasonId" value={episodeContext.season.id} />
              <label>Número do episódio
                <input type="number" name="episodeNumber" min="1" max="10000" step="1" required
                  defaultValue={Math.max(0, ...episodeContext.season.episodes.map((e) => e.episodeNumber)) + 1} />
              </label>
            </>}
            {sourceType === "collection" ? (
              <p className="form-hint">Salve a série e depois cadastre as temporadas e os episódios. Cada episódio terá seu próprio link ou arquivo.</p>
            ) : <label>Origem do vídeo
              <select value={sourceType} disabled={!!video} onChange={(e) => setSourceType(e.target.value)}>
                <option value="upload">Upload de arquivo</option>
                <option value="external">Vídeo externo</option>
              </select>
            </label>}
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
                defaultValue={video?.categoryId || episodeContext?.series.categoryId || ""}
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
                  {sourceType !== "upload" ? "JPG, PNG ou WebP, até 10 MB. Sem imagem, usamos uma capa padrão." : "JPG, PNG ou WebP, até 10 MB. Sem imagem, geramos uma do vídeo."}
                </span>
              </label>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="published"
                defaultChecked={video?.published ?? true}
              />{" "}
              {sourceType !== "upload" ? "Publicar agora" : "Publicar quando o vídeo estiver pronto"}
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
            {busy ? "Aguarde…" : video ? "Salvar alterações" : sourceType === "collection" ? "Criar série e adicionar temporadas" : sourceType === "external" ? "Cadastrar vídeo externo" : "Enviar vídeo"}
          </button>
        </form>
      )}
    </>
  );
}
