import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="page-width empty-state not-found">
      <p className="eyebrow">404</p>
      <h1>Essa cena não está no acervo.</h1>
      <p>O vídeo ou endereço solicitado não foi encontrado.</p>
      <Link to="/" className="button button-accent">
        Voltar ao início
      </Link>
    </div>
  );
}
