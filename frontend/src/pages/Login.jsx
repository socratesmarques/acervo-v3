import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
export default function Login() {
  const { user, login } = useAuth(),
    location = useLocation(),
    navigate = useNavigate();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  async function submit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await login(form.get("email"), form.get("password"));
      const from = location.state?.from;
      navigate(from?.startsWith("/") && !from.startsWith("//") ? from : "/", {
        replace: true,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <div className="auth-art">
        <p className="eyebrow">SEUS MOMENTOS EM CENA</p>
        <h1>
          O que é seu
          <br />
          <em>merece replay.</em>
        </h1>
        <p>
          Viagens, projetos e histórias.
          <br />
          Tudo em um lugar que é só seu.
        </p>
      </div>
      <form className="auth-form form-stack" onSubmit={submit}>
        <h2>Bem-vindo ao Acervo.</h2>
        <p className="muted">Entre para acessar seus vídeos.</p>
        <label>
          E-mail
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
          />
        </label>
        <label>
          Senha
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy} className="button button-accent">
          {busy ? "Entrando…" : "Entrar"}
        </button>
        <p className="form-hint">
          Seu acesso é criado pelo administrador da plataforma.
        </p>
      </form>
    </div>
  );
}
