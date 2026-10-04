import type { ApiErrorBody } from "../../shared/api";

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

/** Fired on window when a signed-in request comes back 401 (session expired or revoked). */
export const SESSION_EXPIRED_EVENT = "cw:session-expired";

export type Query = Record<string, string | number | boolean | undefined | null>;

export function queryString(query: Query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  return params.size ? `?${params}` : "";
}

async function request<T>(method: string, path: string, { query = {}, body, signal }: { query?: Query; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const isForm = body instanceof FormData;
  const url = `/api${path}${queryString(query)}`;
  const res = await fetch(url, {
    method,
    signal,
    credentials: "same-origin",
    // CSRF defence: the API only accepts JSON writes, or uploads that carry X-Requested-With.
    headers: {
      Accept: "application/json",
      ...(method === "GET" ? {} : isForm ? { "X-Requested-With": "fetch" } : { "Content-Type": "application/json" }),
    },
    body: method === "GET" ? undefined : isForm ? body : JSON.stringify(body ?? {}),
  });
  if (res.status === 204) return undefined as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  if (!res.ok || !isJson) {
    const payload = isJson ? ((await res.json()) as ApiErrorBody) : undefined;
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw new ApiError(res.status, payload?.error.code ?? "BAD_RESPONSE", payload?.error.message ?? `Unexpected response from ${url}`, payload?.error.details);
  }
  return (await res.json()) as T;
}

export const apiGet = <T>(path: string, query: Query = {}, signal?: AbortSignal) => request<T>("GET", path, { query, signal });
export const apiPost = <T>(path: string, body?: unknown) => request<T>("POST", path, { body });
export const apiPatch = <T>(path: string, body: unknown) => request<T>("PATCH", path, { body });
export const apiPut = <T>(path: string, body: unknown) => request<T>("PUT", path, { body });
export const apiDelete = <T = void>(path: string) => request<T>("DELETE", path);

export function apiUpload<T>(path: string, file: File, kind: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return request<T>("POST", path, { body: form });
}

/** Starts a browser download of an API file (the session cookie authenticates it). */
export function download(path: string, query: Query = {}) {
  const anchor = document.createElement("a");
  anchor.href = `/api${path}${queryString(query)}`;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
