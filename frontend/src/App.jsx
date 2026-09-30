import { Suspense, lazy, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, RequireAuth } from "./context/Auth";
import Header from "./components/Header";
import Home from "./pages/Home";
import Catalog from "./pages/Catalog";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import NotFound from "./pages/NotFound";
const Video = lazy(() => import("./pages/Video"));
const Admin = lazy(() => import("./pages/Admin"));
export default function App() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <AuthProvider>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo">
        <Suspense fallback={<div className="empty-state">Carregando…</div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <Home />
                </RequireAuth>
              }
            />
            <Route
              path="/categorias"
              element={
                <RequireAuth>
                  <Catalog mode="categories" />
                </RequireAuth>
              }
            />
            <Route
              path="/buscar"
              element={
                <RequireAuth>
                  <Catalog mode="search" />
                </RequireAuth>
              }
            />
            <Route
              path="/minha-lista"
              element={
                <RequireAuth>
                  <Catalog mode="favorites" />
                </RequireAuth>
              }
            />
            <Route
              path="/video/:id"
              element={
                <RequireAuth>
                  <Video key={pathname} />
                </RequireAuth>
              }
            />
            <Route
              path="/perfil"
              element={
                <RequireAuth>
                  <Profile />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/*"
              element={
                <RequireAuth admin>
                  <Admin />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <footer className="footer page-width">
        <strong>
          ACERVO<span>•</span>
        </strong>
        <p>Seus momentos merecem uma tela.</p>
        <span>Seu cinema pessoal</span>
      </footer>
    </AuthProvider>
  );
}
