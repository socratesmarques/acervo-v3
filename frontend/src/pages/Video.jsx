import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api } from "../services/api";
import { formatDate, formatDuration } from "../utils/format";
import useData from "../hooks/useData";
import Feedback from "../components/Feedback";
import ExternalPlayer from "../components/ExternalPlayer";
import Player from "../components/Player";
import FavoriteButton from "../components/FavoriteButton";
import VideoRow from "../components/VideoRow";
import SeriesBrowser from "../components/SeriesBrowser";

function Playback({ video }) {
  if (video.status !== "ready") return <div className="empty-state"><h2>Vídeo em processamento</h2><p>Acompanhe o status no painel administrativo.</p></div>;
  return video.sourceType === "external" ? <ExternalPlayer key={`${video.id}-${video.externalUrl}`} video={video} /> : <Player key={video.id} video={video} />;
}
export default function Video() {
  const { id } = useParams();
  const state = useData(async (signal) => {
    const video = await api(`/videos/${id}`, { signal });
    const seriesId = video.contentType === "series" ? video.id : video.seriesId;
    const [related, seasonData, series] = await Promise.all([
      api(`/videos?category=${video.categoryId}&limit=12`, { signal }),
      seriesId ? api(`/series/${seriesId}/seasons`, { signal }) : null,
      video.seriesId ? api(`/videos/${video.seriesId}`, { signal }) : null,
    ]);
    return { video, series: series || (seriesId ? video : null), seasons: seasonData?.items || [], related: related.items.filter((v) => v.id !== id && v.id !== seriesId) };
  }, [id]);
  // Never leave the previous episode's player running while loading the next one.
  if (state.loading || state.error) return <Feedback {...state} />;
  const { video, related, series, seasons } = state.data;
  const episodes = seasons.flatMap((s) => s.episodes);
  const currentIndex = episodes.findIndex((ep) => ep.id === video.id);
  const next = currentIndex >= 0 ? episodes.slice(currentIndex + 1).find((ep) => ep.status === "ready") : null;
  const isSeries = video.contentType === "series";
  return <div className="page-width watch-page">
    <Link to={video.seriesId ? `/video/${video.seriesId}` : "/"} className="back-link"><ArrowLeft size={18} />{video.seriesId ? "Voltar à série" : "Voltar ao início"}</Link>
    {!isSeries && <Playback video={video} />}
    <div className="video-detail">
      <div>
        <p className="eyebrow">{isSeries ? "Série" : video.seriesId ? `Temporada ${video.seasonNumber} · Episódio ${video.episodeNumber}` : "Filme"} · {video.category}</p>
        <h1>{video.title}</h1>
        <p className="video-description">{video.description}</p>
        <div className="hero-buttons"><FavoriteButton key={`${video.id}-${video.favorite}`} video={video} />
          {next && <Link className="button button-accent" to={`/video/${next.id}`}>Próximo episódio <ArrowRight size={18} /></Link>}
        </div>
      </div>
      <dl>
        <div><dt>Publicado em</dt><dd>{formatDate(video.publishedAt)}</dd></div>
        <div><dt>{isSeries ? "Episódios disponíveis" : "Duração"}</dt><dd>{isSeries ? episodes.length : video.duration ? formatDuration(video.duration) : "Não informada"}</dd></div>
        {!isSeries && <div><dt>Visualizações</dt><dd>{video.views}</dd></div>}
      </dl>
    </div>
    {series && <SeriesBrowser key={video.id} series={series} seasons={seasons} video={video} />}
    {isSeries && video.sourceType !== "collection" && <details className="legacy-series"><summary>Vídeo original da série</summary><Playback video={video} /></details>}
    <VideoRow title="Mais desse universo" videos={related} />
  </div>;
}
