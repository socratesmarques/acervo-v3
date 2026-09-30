export default function Feedback({ loading, error, reload }) {
  if (loading)
    return (
      <div className="page-width empty-state" role="status">
        Carregando seu acervo…
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
  return null;
}
