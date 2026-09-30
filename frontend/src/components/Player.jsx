import { useEffect, useRef, useState } from "react";
import Hls from "hls.js/dist/hls.light.mjs";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  RotateCcw,
} from "lucide-react";
import { api } from "../services/api";
import { formatDuration } from "../utils/format";
export default function Player({ video }) {
  const element = useRef(null),
    frame = useRef(null),
    hlsRef = useRef(null),
    lastSave = useRef(0),
    counted = useRef(false);
  const initialResume = video.position > 3 && !video.completed;
  const waiting = useRef(initialResume);
  const [resume, setResume] = useState(initialResume),
    [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(video.duration);
  const [volume, setVolume] = useState(1),
    [levels, setLevels] = useState([]),
    [quality, setQuality] = useState(-1),
    [error, setError] = useState(""),
    [historyError, setHistoryError] = useState(""),
    [mp4, setMp4] = useState(false);
  async function save(ended = false, keepalive = false) {
    const el = element.current;
    if (!el || waiting.current || !Number.isFinite(el.currentTime)) return;
    try {
      await api("/history", {
        method: "POST",
        body: { videoId: video.id, position: el.currentTime, ended },
        keepalive,
      });
      setHistoryError("");
    } catch (e) {
      if (!keepalive)
        setHistoryError(`Seu progresso não foi salvo: ${e.message}`);
    }
  }
  useEffect(() => {
    const el = element.current;
    if (mp4) {
      el.src = video.mp4Url;
    } else if (Hls.isSupported()) {
      const hls = new Hls({ maxBufferLength: 30 });
      hlsRef.current = hls;
      hls.loadSource(video.source);
      hls.attachMedia(el);
      hls.on(Hls.Events.MANIFEST_PARSED, () =>
        setLevels(hls.levels.map((l, index) => ({ height: l.height, index }))),
      );
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal)
          setError("Falha no streaming HLS. Você pode usar a versão MP4.");
      });
    } else if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = video.source;
    } else {
      el.src = video.mp4Url;
    }
    const persist = () => {
      if (!waiting.current && el.currentTime > 0)
        api("/history", {
          method: "POST",
          body: {
            videoId: video.id,
            position: el.currentTime,
            ended: el.ended,
          },
          keepalive: true,
        }).catch(() => {});
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", visibility);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      el.removeAttribute("src");
      el.load();
    };
  }, [video.id, video.source, video.mp4Url, mp4]);
  async function play() {
    try {
      await element.current.play();
    } catch {
      setError("Não foi possível iniciar a reprodução. Tente novamente.");
    }
  }
  function chooseResume(continueVideo) {
    waiting.current = false;
    setResume(false);
    element.current.currentTime = continueVideo ? video.position : 0;
    play();
  }
  function update() {
    const el = element.current;
    setTime(el.currentTime);
    if (
      !el.paused &&
      !waiting.current &&
      Date.now() - lastSave.current > 10000
    ) {
      lastSave.current = Date.now();
      save();
    }
  }
  async function onPlay() {
    setPlaying(true);
    if (!counted.current) {
      counted.current = true;
      try {
        await api(`/videos/${video.id}/view`, { method: "POST" });
      } catch {
        counted.current = false;
      }
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (frame.current.requestFullscreen)
        await frame.current.requestFullscreen();
      else element.current.webkitEnterFullscreen?.();
    } catch {
      setError("Tela cheia indisponível neste navegador.");
    }
  }
  return (
    <div>
      <div className="custom-player" ref={frame}>
        <video
          ref={element}
          playsInline
          preload="metadata"
          poster={video.thumbnail}
          aria-label={`Player de ${video.title}`}
          onTimeUpdate={update}
          onLoadedMetadata={() => {
            setDuration(element.current.duration);
            if (!waiting.current && time > 0)
              element.current.currentTime = time;
          }}
          onPlay={onPlay}
          onPause={() => {
            setPlaying(false);
            save();
          }}
          onEnded={() => {
            setPlaying(false);
            save(true);
          }}
          onError={() =>
            setError(
              "Não foi possível reproduzir este vídeo. Confira sua conexão ou tente a versão MP4.",
            )
          }
          onClick={() => {
            if (!resume) {
              if (playing) element.current.pause();
              else play();
            }
          }}
        />
        {resume && (
          <div className="resume-overlay">
            <h2>Continuar de onde parou?</h2>
            <p>Você estava em {formatDuration(video.position)}.</p>
            <div className="hero-buttons">
              <button
                className="button button-accent"
                onClick={() => chooseResume(true)}
              >
                Continuar
              </button>
              <button
                className="button button-glass"
                onClick={() => chooseResume(false)}
              >
                Do início
              </button>
            </div>
          </div>
        )}
        <div className="player-controls">
          <input
            className="seek-slider"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(time, duration || 0)}
            disabled={resume}
            aria-label="Posição do vídeo"
            onChange={(e) => {
              element.current.currentTime = Number(e.target.value);
              setTime(Number(e.target.value));
            }}
            onPointerUp={() => save()}
            onKeyUp={() => save()}
          />
          <div className="player-toolbar">
            <button
              className="icon-button"
              disabled={resume}
              aria-label={playing ? "Pausar" : "Reproduzir"}
              onClick={() => (playing ? element.current.pause() : play())}
            >
              {playing ? <Pause /> : <Play />}
            </button>
            <span className="player-time">
              {formatDuration(time)} / {formatDuration(duration)}
            </span>
            <button
              className="icon-button"
              aria-label={volume ? "Silenciar" : "Ativar som"}
              onClick={() => {
                const v = volume ? 0 : 1;
                element.current.volume = v;
                setVolume(v);
              }}
            >
              {volume ? <Volume2 /> : <VolumeX />}
            </button>
            <input
              className="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              aria-label="Volume"
              onChange={(e) => {
                const v = Number(e.target.value);
                element.current.volume = v;
                setVolume(v);
              }}
            />
            {levels.length > 0 && (
              <label className="quality-select">
                <span className="sr-only">Qualidade</span>
                <select
                  aria-label="Qualidade do vídeo"
                  value={quality}
                  onChange={(e) => {
                    const q = Number(e.target.value);
                    setQuality(q);
                    hlsRef.current.currentLevel = q;
                  }}
                >
                  <option value={-1}>Automática</option>
                  {levels.map((l) => (
                    <option key={l.index} value={l.index}>
                      {l.height}p
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              className="icon-button fullscreen-button"
              onClick={fullscreen}
              aria-label="Tela cheia"
            >
              <Maximize />
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="error-message" role="alert">
          <p>{error}</p>
          {!mp4 && (
            <button
              className="button button-glass"
              onClick={() => {
                setError("");
                setLevels([]);
                setQuality(-1);
                setMp4(true);
              }}
            >
              <RotateCcw size={16} /> Usar MP4
            </button>
          )}
        </div>
      )}
      {historyError && (
        <p className="form-error" role="status">
          {historyError}
        </p>
      )}
    </div>
  );
}
