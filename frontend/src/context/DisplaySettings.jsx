import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../services/api";

const DisplaySettingsContext = createContext({ showReleaseYear: true });
export const useDisplaySettings = () => useContext(DisplaySettingsContext);

export function DisplaySettingsProvider({ children }) {
  const [showReleaseYear, setShowReleaseYear] = useState(true);
  useEffect(() => {
    let alive = true;
    const refresh = () => api("/settings").then((data) => {
      if (alive) setShowReleaseYear(data.showReleaseYear);
    }).catch(() => {});
    refresh();
    window.addEventListener("acervo-settings-change", refresh);
    return () => {
      alive = false;
      window.removeEventListener("acervo-settings-change", refresh);
    };
  }, []);
  return <DisplaySettingsContext.Provider value={{ showReleaseYear }}>{children}</DisplaySettingsContext.Provider>;
}
