import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { api, setCsrf } from "../services/api";
import { AuthContext, useAuth } from "./useAuth";
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function reload() {
    setLoading(true);
    setError("");
    try {
      const data = await api("/auth/me");
      setCsrf(data.csrf);
      setUser(data.user);
    } catch (e) {
      setUser(null);
      if (e.status !== 401) setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    api("/auth/me", { signal: controller.signal })
      .then((data) => {
        setCsrf(data.csrf);
        setUser(data.user);
      })
      .catch((e) => {
        if (e.name !== "AbortError" && e.status !== 401) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    const expired = () => {
      setUser(null);
      setCsrf("");
    };
    window.addEventListener("session-expired", expired);
    return () => {
      controller.abort();
      window.removeEventListener("session-expired", expired);
    };
  }, []);
  async function login(email, password) {
    const data = await api("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setCsrf(data.csrf);
    setUser(data.user);
  }
  async function logout() {
    await api("/auth/logout", { method: "POST" });
    setCsrf("");
    setUser(null);
  }
  return (
    <AuthContext.Provider
      value={{ user, loading, error, reload, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export function RequireAuth({ children, admin = false }) {
  const { user, loading, error, reload } = useAuth(),
    location = useLocation();
  if (loading)
    return (
      <div className="page-width empty-state" role="status">
        Abrindo seu acervo…
      </div>
    );
  if (error)
    return (
      <div className="page-width empty-state">
        <p role="alert">{error}</p>
        <button className="button button-accent" onClick={reload}>
          Tentar novamente
        </button>
      </div>
    );
  if (!user)
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search + location.hash }}
        replace
      />
    );
  if (admin && user.role !== "admin")
    return (
      <div className="page-width empty-state">
        <h1>Acesso restrito ao administrador.</h1>
      </div>
    );
  return children;
}
