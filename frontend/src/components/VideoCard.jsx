import { Play } from "lucide-react";
import { Link } from "react-router-dom";
import { formatDuration } from "../utils/format";

export default function VideoCard({ video, showProgress = false }) {
  return (
    <Link
      to={`/video/${video.id}`}
      className="video-card group"
      aria-label={`Assistir ${video.title}`}
    >
      <div className="thumbnail">
        <img
          src={video.thumbnail}
          alt=""
          loading="lazy"
          width="640"
          height="360"
        />
        <span className="card-play">
          <Play size={23} fill="currentColor" aria-hidden="true" />
        </span>
        <span className="duration">{video.sourceType === "external" && !video.duration ? "Externo" : formatDuration(video.duration)}</span>
        {showProgress && (
          <div
            className="progress-track"
            role="progressbar"
            aria-label={`Progresso em ${video.title}`}
            aria-valuenow={video.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span style={{ width: `${video.progress}%` }} />
          </div>
        )}
      </div>
      <div className="card-info">
        <h3>{video.title}</h3>
        <p>
          {video.contentType === "series" ? "Série" : "Filme"} · {video.category}
          {showProgress
            ? ` · ${video.progress}% assistido`
            : ` · ${new Date(video.publishedAt).getFullYear()}`}
        </p>
      </div>
    </Link>
  );
}
