import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../services/api";
import { useAuth } from "./useAuth";

const DisplaySettingsContext = createContext({ showReleaseYear: true });
export const useDisplaySettings = () => useContext(DisplaySettingsContext);

export function DisplaySettingsProvider({ children }) {
  const [showReleaseYear, setShowReleaseYear] = useState(true);
  const { user } = useAuth();
  useEffect(() => {
    let alive = true;
    const refresh = () => api("/settings").then((data) => {
      if (alive) setShowReleaseYear(data.showReleaseYear);
    }).catch(() => {});
    if (user) refresh();
    else setShowReleaseYear(true);
    window.addEventListener("acervo-settings-change", refresh);
    return () => {
      alive = false;
      window.removeEventListener("acervo-settings-change", refresh);
    };
  }, [user?.id]);
  return <DisplaySettingsContext.Provider value={{ showReleaseYear }}>{children}</DisplaySettingsContext.Provider>;
}
