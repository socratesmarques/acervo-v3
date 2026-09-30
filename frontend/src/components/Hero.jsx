import { ArrowUpRight, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDuration } from "../utils/format";
export default function Hero({ video }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <img
        className="hero-image"
        src={video.thumbnail}
        alt=""
        fetchPriority="high"
      />
      <div className="hero-shade" />
      <div className="hero-content page-width">
        <p className="eyebrow">
          <span /> SEU PRÓXIMO PLAY
        </p>
        <h1 id="hero-title" className="real-title">
          {video.title}
        </h1>
        <div className="hero-meta">
          <strong>{video.category}</strong>
          <span>{new Date(video.publishedAt).getFullYear()}</span>
          <span>{video.sourceType === "external" && !video.duration ? "Vídeo externo" : formatDuration(video.duration)}</span>
        </div>
        <p className="hero-description">{video.description}</p>
        <div className="hero-buttons">
          <Link className="button button-accent" to={`/video/${video.id}`}>
            <Play size={19} fill="currentColor" /> Assistir agora
          </Link>
          <Link
            className="button button-glass"
            to={`/categorias?categoria=${video.categoryId}`}
          >
            Explorar categoria <ArrowUpRight size={19} />
          </Link>
        </div>
      </div>
    </section>
  );
}
