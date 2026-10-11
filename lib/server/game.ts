import { HttpError } from "./http";
import type { GameRow, PhaseRow, PlayerRow } from "./rows";
import { db, must } from "./supabase";
import { hashToken } from "./tokens";

export function bearerToken(req: Request): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export async function loadGame(gameId: string): Promise<GameRow> {
  if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new HttpError(404, "Partita non trovata");
  const { data, error } = await db().from("games").select("*").eq("id", gameId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, "Partita non trovata");
  return data as GameRow;
}

/** Identifica il giocatore dal token Bearer (salvato sul telefono). */
export async function authPlayer(req: Request, gameId: string): Promise<PlayerRow> {
  const token = bearerToken(req);
  if (!token) throw new HttpError(401, "Sessione mancante");
  const { data, error } = await db()
    .from("players")
    .select("*")
    .eq("token_hash", hashToken(token))
    .eq("game_id", gameId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(401, "Sessione non valida o spostata su un altro dispositivo");
  return data as PlayerRow;
}

export function requireHost(player: PlayerRow): void {
  if (!player.is_host) throw new HttpError(403, "Solo l'host può farlo");
}

export async function loadPhases(gameId: string): Promise<PhaseRow[]> {
  const rows = must(
    await db().from("phases").select("*").eq("game_id", gameId).order("idx"),
    "phases",
  ) as PhaseRow[];
  return rows;
}

export async function loadPlayers(gameId: string): Promise<PlayerRow[]> {
  return must(
    await db().from("players").select("*").eq("game_id", gameId).order("joined_at"),
    "players",
  ) as PlayerRow[];
}

/**
 * Aggiorna la partita solo se la versione non è cambiata (concorrenza ottimistica).
 * Restituisce la riga aggiornata, o null se qualcun altro è arrivato prima.
 */
export async function updateGameIfVersion(
  game: GameRow,
  patch: Partial<Omit<GameRow, "id" | "version">>,
): Promise<GameRow | null> {
  const { data, error } = await db()
    .from("games")
    .update(patch)
    .eq("id", game.id)
    .eq("version", game.version)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as GameRow | null) ?? null;
}
