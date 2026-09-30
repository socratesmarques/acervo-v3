import { useState } from "react";
import { Check, Plus } from "lucide-react";
import { api, invalidate } from "../services/api";
export default function FavoriteButton({ video }) {
  const [favorite, setFavorite] = useState(video.favorite),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await api(`/favorites/${video.id}`, {
        method: favorite ? "DELETE" : "PUT",
      });
      setFavorite(!favorite);
      invalidate();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        className="button button-glass"
        disabled={busy}
        aria-pressed={favorite}
        onClick={toggle}
      >
        {favorite ? <Check size={18} /> : <Plus size={18} />}{" "}
        {favorite ? "Na minha lista" : "Minha lista"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </div>
  );
}
