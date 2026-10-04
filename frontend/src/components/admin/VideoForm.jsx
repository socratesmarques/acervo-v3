import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, upload } from "../../services/api";
export default function VideoForm({ video, categories, maxUploadMB, episodeContext }) {
  const contentType = video?.contentType || (episodeContext ? "episode" : "movie");
  const [sourceType, setSourceType] = useState(video?.sourceType || (episodeContext ? "external" : "upload"));
  const seriesId = episodeContext?.series.id || video?.seriesId;
  const returnPath = seriesId ? `/admin/series/${seriesId}` : "/admin/videos";
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
            releaseYear: f.get("releaseYear") ? Number(f.get("releaseYear")) : null,
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
            <input type="hidden" name="contentType" value={contentType} />
            {!episodeContext && !video && <p className="form-hint">Para organizar temporadas e episódios, <Link to="/admin/series/new">crie uma série na aba Séries</Link>.</p>}
            {episodeContext && <>
              <input type="hidden" name="seasonId" value={episodeContext.season.id} />
              <label>Número do episódio
                <input type="number" name="episodeNumber" min="1" max="10000" step="1" required
                  defaultValue={Math.max(0, ...episodeContext.season.episodes.map((e) => e.episodeNumber)) + 1} />
              </label>
            </>}
            <label>Origem do vídeo
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
            <label>Ano de exibição (opcional)
              <input name="releaseYear" type="number" min="1888" max="2100" step="1"
                defaultValue={video?.releaseYear ?? episodeContext?.series.releaseYear ?? ""} placeholder="Ex.: 2024" />
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
                  {contentType === "episode" ? "JPG, PNG ou WebP, até 10 MB. Sem capa própria, a série pode fornecer a capa padrão." : sourceType !== "upload" ? "JPG, PNG ou WebP, até 10 MB. Sem imagem, usamos uma capa padrão." : "JPG, PNG ou WebP, até 10 MB. Sem imagem, geramos uma do vídeo."}
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
            {busy ? "Aguarde…" : video ? "Salvar alterações" : sourceType === "external" ? "Cadastrar vídeo externo" : "Enviar vídeo"}
          </button>
        </form>
      )}
    </>
  );
}
