import { DEFAULT_SETTINGS, MAX_PLAYERS, type GameSettings } from "@/lib/game/settings";
import { HttpError } from "./http";
import { notifyGame } from "./notify";
import type { GameRow, PlayerRow } from "./rows";
import { db, must } from "./supabase";
import { hashToken, newGameCode, newToken, normalizeCode } from "./tokens";

export interface Session {
  gameId: string;
  playerId: string;
  token: string;
}

function cleanNickname(raw: string): string {
  const n = raw.replace(/\s+/g, " ").trim().slice(0, 24);
  if (n.length < 1) throw new HttpError(400, "Scegli un nome.");
  return n;
}

export async function createGame(input: { nickname: string; pref: "m" | "f" | "any" }): Promise<Session & { code: string }> {
  const nickname = cleanNickname(input.nickname);
  let game: GameRow | null = null;
  for (let i = 0; i < 5 && !game; i++) {
    const { data, error } = await db()
      .from("games")
      .insert({ code: newGameCode(), settings: DEFAULT_SETTINGS })
      .select("*")
      .single();
    if (!error) game = data as GameRow;
    else if (!error.message.includes("duplicate")) throw new Error(error.message);
  }
  if (!game) throw new Error("Impossibile generare un codice partita");
  const token = newToken();
  const player = must(
    await db()
      .from("players")
      .insert({ game_id: game.id, nickname, character_pref: input.pref, is_host: true, token_hash: hashToken(token) })
      .select("id")
      .single(),
    "host",
  ) as { id: string };
  return { gameId: game.id, playerId: player.id, token, code: game.code };
}

export async function joinGame(input: {
  code: string;
  nickname: string;
  pref: "m" | "f" | "any";
  spectator: boolean;
}): Promise<Session> {
  const code = normalizeCode(input.code);
  const { data, error } = await db().from("games").select("*").eq("code", code).maybeSingle();
  if (error) throw new Error(error.message);
  const game = data as GameRow | null;
  if (!game) throw new HttpError(404, "Nessuna partita con questo codice.");
  const nickname = input.spectator ? cleanNickname(input.nickname || "TV") : cleanNickname(input.nickname);

  if (!input.spectator) {
    if (game.status !== "lobby") {
      throw new HttpError(409, "La partita è già partita. Se eri già dentro, usa il tuo link personale o chiedi all'host di riassegnarti.");
    }
    const players = must(
      await db().from("players").select("nickname,is_spectator").eq("game_id", game.id),
      "players",
    ) as Pick<PlayerRow, "nickname" | "is_spectator">[];
    const active = players.filter((p) => !p.is_spectator);
    if (active.length >= MAX_PLAYERS) throw new HttpError(409, `La partita è piena (max ${MAX_PLAYERS}).`);
    if (active.some((p) => p.nickname.toLowerCase() === nickname.toLowerCase())) {
      throw new HttpError(409, "Questo nome è già preso: scegline un altro.");
    }
  }

  const token = newToken();
  const player = must(
    await db()
      .from("players")
      .insert({
        game_id: game.id,
        nickname,
        character_pref: input.pref,
        is_spectator: input.spectator,
        token_hash: hashToken(token),
      })
      .select("id")
      .single(),
    "join",
  ) as { id: string };
  await notifyGame(game.id);
  return { gameId: game.id, playerId: player.id, token };
}

export async function rejoin(token: string): Promise<{ gameId: string }> {
  const { data, error } = await db().from("players").select("game_id").eq("token_hash", hashToken(token)).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new HttpError(404, "Link non valido o scaduto (forse l'host ti ha riassegnato a un altro dispositivo).");
  return { gameId: (data as { game_id: string }).game_id };
}

export async function updateSettings(game: GameRow, settings: GameSettings): Promise<void> {
  if (game.status !== "lobby") throw new HttpError(409, "Le impostazioni si cambiano solo in lobby.");
  must(await db().from("games").update({ settings }).eq("id", game.id), "settings");
  await notifyGame(game.id);
}

export async function updateMe(game: GameRow, me: PlayerRow, input: { nickname?: string; pref?: "m" | "f" | "any" }) {
  if (game.status !== "lobby") throw new HttpError(409, "Puoi modificare il profilo solo in lobby.");
  const patch: Record<string, unknown> = {};
  if (input.nickname !== undefined) patch.nickname = cleanNickname(input.nickname);
  if (input.pref !== undefined) patch.character_pref = input.pref;
  must(await db().from("players").update(patch).eq("id", me.id), "update me");
  await notifyGame(game.id);
}

export async function kickPlayer(game: GameRow, host: PlayerRow, playerId: string): Promise<void> {
  if (game.status !== "lobby") throw new HttpError(409, "Si possono rimuovere giocatori solo in lobby.");
  if (playerId === host.id) throw new HttpError(400, "L'host non può rimuovere sé stesso.");
  must(await db().from("players").delete().eq("id", playerId).eq("game_id", game.id), "kick");
  await notifyGame(game.id);
}

/** Genera un nuovo token per un giocatore: il vecchio dispositivo viene scollegato. */
export async function reassignPlayer(game: GameRow, playerId: string): Promise<{ token: string }> {
  const token = newToken();
  const rows = must(
    await db().from("players").update({ token_hash: hashToken(token) }).eq("id", playerId).eq("game_id", game.id).select("id"),
    "reassign",
  ) as { id: string }[];
  if (!rows.length) throw new HttpError(404, "Giocatore non trovato.");
  return { token };
}
