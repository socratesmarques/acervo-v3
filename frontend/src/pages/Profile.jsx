import { useState } from "react";
import { useAuth } from "../context/useAuth";
import { api } from "../services/api";
export default function Profile() {
  const { user, reload } = useAuth(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("newPassword") !== f.get("confirm")) {
      setError("As novas senhas não coincidem.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/auth/password", {
        method: "PUT",
        body: {
          currentPassword: f.get("currentPassword"),
          newPassword: f.get("newPassword"),
        },
      });
      await reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-width catalog-page">
      <h1>Meu perfil</h1>
      <p>
        {user.name} · {user.email}
      </p>
      <form onSubmit={submit} className="form-stack narrow-form">
        <h2>Alterar senha</h2>
        <label>
          Senha atual
          <input
            type="password"
            name="currentPassword"
            autoComplete="current-password"
            required
          />
        </label>
        <label>
          Nova senha
          <input
            type="password"
            name="newPassword"
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirmar nova senha
          <input
            type="password"
            name="confirm"
            minLength={12}
            maxLength={200}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="form-hint">
          Use pelo menos 12 caracteres. Ao salvar, todas as sessões serão
          encerradas.
        </p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <button disabled={busy} className="button button-accent">
          {busy ? "Salvando…" : "Salvar senha"}
        </button>
      </form>
    </div>
  );
}
