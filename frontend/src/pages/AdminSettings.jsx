import { useEffect, useState } from "react";
import { api } from "../services/api";
import Feedback from "../components/Feedback";

export default function AdminSettings() {
  const [showReleaseYear, setShowReleaseYear] = useState(true);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  useEffect(() => {
    let alive = true;
    api("/settings").then((data) => {
      if (alive) setShowReleaseYear(data.showReleaseYear);
    }).catch((e) => { if (alive) setError(e.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);
  if (loading) return <p role="status">Carregando preferências…</p>;
  if (error && !notice) return <Feedback error={new Error(error)} onRetry={() => window.location.reload()} />;
  async function save(event) {
    event.preventDefault();
    setBusy(true); setNotice(""); setError("");
    try {
      const data = await api("/admin/settings", { method: "PUT", body: { showReleaseYear } });
      setShowReleaseYear(data.showReleaseYear);
      window.dispatchEvent(new Event("acervo-settings-change"));
      setNotice("Preferência atualizada para todo o ACERVO.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section>
    <p className="eyebrow">PREFERÊNCIAS GLOBAIS</p>
    <h1>Configurações de exibição</h1>
    <p className="muted">Esta configuração vale para filmes, séries e episódios de todos os usuários. Os anos cadastrados não são apagados.</p>
    <form className="upload-form" onSubmit={save}>
      <label className="checkbox-label">
        <input type="checkbox" checked={showReleaseYear} onChange={(e) => setShowReleaseYear(e.target.checked)} />
        Mostrar ano de exibição dos vídeos
      </label>
      <button className="button button-accent" disabled={busy}>{busy ? "Salvando…" : "Salvar configuração"}</button>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  </section>;
}
