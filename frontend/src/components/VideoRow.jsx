import { useId, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import VideoCard from "./VideoCard";

export default function VideoRow({
  title,
  subtitle,
  videos,
  showProgress = false,
}) {
  const track = useRef(null);
  const id = useId();
  if (!videos.length) return null;
  function scroll(direction) {
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    track.current.scrollBy({
      left: direction * track.current.clientWidth * 0.85,
      behavior: reducedMotion ? "instant" : "smooth",
    });
  }
  return (
    <section className="video-section" aria-labelledby={id}>
      <div className="row-heading">
        <div>
          <h2 id={id}>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="row-controls">
          <button
            className="icon-button"
            onClick={() => scroll(-1)}
            aria-label={`Voltar em ${title}`}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="icon-button"
            onClick={() => scroll(1)}
            aria-label={`Avançar em ${title}`}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
      <div ref={track} className="video-track">
        {videos.map((video) => (
          <VideoCard key={video.id} video={video} showProgress={showProgress} />
        ))}
      </div>
    </section>
  );
}
