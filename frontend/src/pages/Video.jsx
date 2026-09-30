import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { api } from "../services/api";
import { formatDate, formatDuration } from "../utils/format";
import useData from "../hooks/useData";
import Feedback from "../components/Feedback";
import ExternalPlayer from "../components/ExternalPlayer";
import Player from "../components/Player";
import FavoriteButton from "../components/FavoriteButton";
import VideoRow from "../components/VideoRow";
export default function Video() {
  const { id } = useParams();
  const state = useData(
    async (signal) => {
      const video = await api(`/videos/${id}`, { signal });
      const related = await api(
        `/videos?category=${video.categoryId}&limit=12`,
        { signal },
      );
      return { video, related: related.items.filter((v) => v.id !== id) };
    },
    [id],
  );
  if ((state.loading && !state.data) || state.error)
    return <Feedback {...state} />;
  const { video, related } = state.data;
  return (
    <div className="page-width watch-page">
      <Link to="/" className="back-link">
        <ArrowLeft size={18} /> Voltar ao início
      </Link>
      {video.status === "ready" ? (
        video.sourceType === "external" ? <ExternalPlayer key={`${video.id}-${video.externalUrl}`} video={video} /> : <Player key={video.id} video={video} />
      ) : (
        <div className="empty-state">
          <h2>Vídeo em processamento</h2>
          <p>Acompanhe o status no painel administrativo.</p>
        </div>
      )}
      <div className="video-detail">
        <div>
          <p className="eyebrow">{video.contentType === "series" ? "Série" : "Filme"} · {video.category}</p>
          <h1>{video.title}</h1>
          <p className="video-description">{video.description}</p>
          <FavoriteButton key={`${video.id}-${video.favorite}`} video={video} />
        </div>
        <dl>
          <div>
            <dt>Publicado em</dt>
            <dd>{formatDate(video.publishedAt)}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{video.sourceType === "external" && !video.duration ? "Não informada" : formatDuration(video.duration)}</dd>
          </div>
          <div>
            <dt>Visualizações</dt>
            <dd>{video.views}</dd>
          </div>
        </dl>
      </div>
      <VideoRow title="Mais desse universo" videos={related} />
    </div>
  );
}
