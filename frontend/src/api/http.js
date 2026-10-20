import axios from "axios";

export const http = axios.create({
  baseURL: "/api",
  timeout: 10000,
  withCredentials: true,
  headers: { Accept: "application/json" },
});

let csrfToken = null;
let csrfHeaderName = "X-CSRF-TOKEN";
let csrfRequest = null;
let csrfGeneration = 0;

export async function refreshCsrf() {
  if (csrfRequest) return csrfRequest;

  const generation = csrfGeneration;

  const request = http.get("/auth/csrf")
    .then(({ data }) => {
      if (generation === csrfGeneration) {
        csrfToken = data.token;
        csrfHeaderName = data.headerName || "X-CSRF-TOKEN";
      }
      return data.token;
    })
    .finally(() => {
      if (generation === csrfGeneration) csrfRequest = null;
    });

  csrfRequest = request;
  return request;
}

export function clearCsrf() {
  csrfGeneration += 1;
  csrfToken = null;
  csrfRequest = null;
}

http.interceptors.request.use(async (config) => {
  const method = (config.method || "get").toLowerCase();

  if (!["get", "head", "options"].includes(method)) {
    if (!csrfToken) await refreshCsrf();

    // Do not send a stale token if another operation invalidated it.
    if (!csrfToken) throw new Error("CSRF token unavailable; retry the request.");

    config.headers.set(csrfHeaderName, csrfToken);
  }

  return config;
});
