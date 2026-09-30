let csrf = "";
export function setCsrf(value) {
  csrf = value || "";
}
export async function api(
  path,
  { method = "GET", body, signal, keepalive = false } = {},
) {
  const headers = {};
  if (body !== undefined && !(body instanceof FormData))
    headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD"].includes(method)) headers["X-CSRF-Token"] = csrf;
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers,
    signal,
    keepalive,
    body:
      body instanceof FormData
        ? body
        : body === undefined
          ? undefined
          : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (
      response.status === 401 &&
      path !== "/auth/login" &&
      path !== "/auth/me"
    )
      window.dispatchEvent(new Event("session-expired"));
    const detail = data.issues
      ?.map((i) => `${i.field}: ${i.message}`)
      .join(" · ");
    const error = new Error(
      detail || data.message || "Não foi possível completar a requisição.",
    );
    error.status = response.status;
    throw error;
  }
  return data;
}
export function upload(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.setRequestHeader("X-CSRF-Token", csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Falha de conexão durante o upload."));
    xhr.onload = () => {
      let data;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(data.message || "Falha ao enviar arquivo."));
    };
    xhr.send(formData);
  });
}
export const invalidate = () =>
  window.dispatchEvent(new Event("catalog-change"));
