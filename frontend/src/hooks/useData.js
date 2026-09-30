import { useEffect, useEffectEvent, useState, useCallback } from "react";
export default function useData(loader, dependencies = []) {
  const [state, setState] = useState({ data: null, key: null, error: "" }),
    [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const requestKey = JSON.stringify([dependencies, version]);
  const load = useEffectEvent((signal) => loader(signal));
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ data, key: requestKey, error: "" });
      })
      .catch((error) => {
        if (error.name !== "AbortError" && !controller.signal.aborted)
          setState({ data: null, key: requestKey, error: error.message });
      });
    return () => controller.abort();
  }, [requestKey]);
  useEffect(() => {
    window.addEventListener("catalog-change", reload);
    return () => window.removeEventListener("catalog-change", reload);
  }, [reload]);
  return {
    ...state,
    loading: state.key !== requestKey,
    error: state.key === requestKey ? state.error : "",
    reload,
  };
}
