/** Token per partita salvati sul dispositivo. Ogni accesso a localStorage è protetto. */

const KEY = (gameId: string) => `mm:token:${gameId}`;
const LAST = "mm:last";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage non disponibile (navigazione privata): si usa il link personale */
  }
}

export function getToken(gameId: string): string | null {
  return safeGet(KEY(gameId));
}

export function saveSession(gameId: string, token: string): void {
  safeSet(KEY(gameId), token);
  safeSet(LAST, JSON.stringify({ gameId, at: Date.now() }));
}

export function clearSession(gameId: string): void {
  safeSet(KEY(gameId), null);
  const last = getLastGame();
  if (last?.gameId === gameId) safeSet(LAST, null);
}

export function getLastGame(): { gameId: string; at: number } | null {
  const raw = safeGet(LAST);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { gameId: string; at: number };
    return getToken(parsed.gameId) ? parsed : null;
  } catch {
    return null;
  }
}

export function personalLink(token: string): string {
  return `${window.location.origin}/r/${encodeURIComponent(token)}`;
}
