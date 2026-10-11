import { getToken } from "./session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown; gameId?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = init.gameId ? getToken(init.gameId) : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "Connessione assente: riprova tra un attimo.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Errore ${res.status}`);
  return data;
}

export const gameApi = (gameId: string) => ({
  post: <T = { ok: true }>(path: string, body: unknown = {}) =>
    apiFetch<T>(`/api/games/${gameId}/${path}`, { method: "POST", body, gameId }),
});
