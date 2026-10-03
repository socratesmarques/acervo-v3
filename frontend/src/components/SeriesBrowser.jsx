import { useState } from "react";
import { Link } from "react-router-dom";
import { Play, Check } from "lucide-react";
import { formatDuration } from "../utils/format";
export default function SeriesBrowser({ series, seasons, video }) {
  const [selected, setSelected] = useState(video.seasonId || seasons[0]?.id || "");
  const season = seasons.find((s) => s.id === selected) || seasons[0];
  return <section className="series-browser" aria-label="Temporadas e episódios">
    <div className="section-title season-toolbar">
      <div><p className="eyebrow">SÉRIE</p><h2><Link to={`/video/${series.id}`}>{series.title}</Link></h2></div>
      {seasons.length > 0 && <label>Selecionar temporada
        <select value={season.id} onChange={(e) => setSelected(e.target.value)}>
          {seasons.map((s) => <option key={s.id} value={s.id}>Temporada {s.number}{s.title ? ` · ${s.title}` : ""}</option>)}
        </select>
      </label>}
    </div>
    {!season?.episodes.length ? <p className="empty-state">Nenhum episódio disponível nesta temporada.</p> : <div className="episode-grid">
      {season.episodes.map((ep) => <Link key={ep.id} to={`/video/${ep.id}`} className={`episode-card ${ep.id === video.id ? "is-current" : ""}`} aria-current={ep.id === video.id ? "true" : undefined}>
        <div className="episode-art"><img src={ep.thumbnail} alt="" loading="lazy" /><Play aria-hidden="true" size={24} />
          {ep.progress > 0 && <progress value={ep.progress} max="100" aria-label={`Progresso: ${ep.title}`} />}
        </div>
        <div><span className="eyebrow">EPISÓDIO {ep.episodeNumber}</span><h3>{ep.title}</h3>
          <p className="muted">{ep.id === video.id ? "Selecionado · " : ""}{ep.duration ? formatDuration(ep.duration) : ep.sourceType === "external" ? "Player externo" : "Duração não informada"}{!ep.published ? " · Rascunho" : ""}</p>
          {ep.completed && <span className="episode-watched"><Check size={16} /> Assistido</span>}
          {ep.description && <p className="episode-description">{ep.description}</p>}
        </div>
      </Link>)}
    </div>}
  </section>;
}
