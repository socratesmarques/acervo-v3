import { Film, Search, X, LogOut, Settings, User } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
export default function Header() {
  const [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState(""),
    [error, setError] = useState("");
  const navigate = useNavigate(),
    { user, logout } = useAuth();
  function search(event) {
    event.preventDefault();
    navigate(`/buscar?q=${encodeURIComponent(query.trim())}`);
    setSearchOpen(false);
  }
  return (
    <header className="header">
      <div className="header-inner page-width">
        <Link to="/" aria-label="Acervo — início" className="brand">
          <Film aria-hidden="true" /> ACERVO<span>•</span>
        </Link>
        {user && (
          <>
            <nav aria-label="Navegação principal" className="navigation">
              <NavLink to="/" end>
                Início
              </NavLink>
              <NavLink to="/categorias">Categorias</NavLink>
              <NavLink to="/minha-lista">Minha lista</NavLink>
            </nav>
            <div className="header-actions">
              <button
                className="icon-button"
                aria-label={searchOpen ? "Fechar busca" : "Abrir busca"}
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen(!searchOpen)}
              >
                {searchOpen ? <X /> : <Search />}
              </button>
              <details className="profile">
                <summary aria-label="Abrir perfil">
                  {user.name.slice(0, 1).toUpperCase()}
                </summary>
                <div className="profile-menu">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                  <Link to="/perfil">
                    <User size={16} /> Meu perfil
                  </Link>
                  {user.role === "admin" && (
                    <Link to="/admin">
                      <Settings size={16} /> Administração
                    </Link>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await logout();
                        navigate("/login");
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    <LogOut size={16} /> Sair
                  </button>
                  {error && <p role="alert">{error}</p>}
                </div>
              </details>
            </div>
          </>
        )}
      </div>
      {user && searchOpen && (
        <form onSubmit={search} className="search-bar page-width">
          <Search size={20} />
          <input
            autoFocus
            type="search"
            maxLength={120}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Título, descrição ou categoria"
            aria-label="Buscar vídeos"
          />
          <button type="submit" className="button button-accent">
            Buscar
          </button>
        </form>
      )}
    </header>
  );
}
