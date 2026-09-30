import { useState } from "react";
import { api } from "../services/api";
export default function ExternalPlayer({ video }) {
  const [started, setStarted] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function start() {
    setBusy(true);
    setError("");
    try {
      await api(`/videos/${video.id}/view`, { method: "POST" });
      setStarted(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Player externo">
      <div className="external-player">
        {started ? (
          <iframe
            src={video.playerUrl}
            title={video.title}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className="external-player-start">
            <p>Este vídeo é reproduzido por um serviço externo.</p>
            <button type="button" className="button button-accent" disabled={busy} onClick={start}>
              {busy ? "Abrindo…" : "Carregar vídeo externo"}
            </button>
            {error && <p role="alert" className="form-error">{error}</p>}
          </div>
        )}
      </div>
      <p className="form-hint">Os controles e a disponibilidade dependem do provedor. O progresso não é salvo automaticamente. Uma visualização representa a abertura do player.</p>
    </section>
  );
}
