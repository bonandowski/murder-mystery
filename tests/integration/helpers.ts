import { createClient } from "@supabase/supabase-js";
import type { PlayerView } from "@/lib/game/view";

export const BASE = process.env.APP_URL ?? "http://localhost:3000";

export const admin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });

export async function call<T = unknown>(path: string, opts: { token?: string; body?: unknown; method?: string } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers: { "Content-Type": "application/json", ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  return { status: res.status, data };
}

export interface Seat {
  nickname: string;
  token: string;
  playerId: string;
}

export async function setupGame(players: string[], settings: Record<string, unknown> = {}) {
  const host = await call<{ gameId: string; token: string; playerId: string; code: string }>("/api/games", {
    body: { nickname: players[0], pref: "f" },
  });
  if (host.status !== 200) throw new Error(`create failed: ${JSON.stringify(host.data)}`);
  const { gameId, code } = host.data;
  const seats: Seat[] = [{ nickname: players[0], token: host.data.token, playerId: host.data.playerId }];
  for (const nickname of players.slice(1)) {
    const r = await call<{ token: string; playerId: string }>("/api/games/join", { body: { code, nickname, pref: "any" } });
    if (r.status !== 200) throw new Error(`join failed: ${JSON.stringify(r.data)}`);
    seats.push({ nickname, token: r.data.token, playerId: r.data.playerId });
  }
  const s = await call(`/api/games/${gameId}/settings`, {
    token: seats[0].token,
    body: { settingPreset: "villa_20s", customSetting: "", tone: "classic", durationMin: 60, difficulty: "medium", notes: "", ...settings },
  });
  if (s.status !== 200) throw new Error(`settings failed: ${JSON.stringify(s.data)}`);
  return { gameId, code, seats };
}

export async function generate(gameId: string, hostToken: string) {
  for (let step = 1; step <= 4; step++) {
    const r = await call<{ ok: boolean; errors?: string[] }>(`/api/games/${gameId}/generate`, {
      token: hostToken,
      body: { step, restart: step === 1 },
    });
    if (r.status !== 200 || !r.data.ok) throw new Error(`step ${step}: ${JSON.stringify(r.data)}`);
  }
}

export const state = async (gameId: string, token: string) => {
  const r = await call<PlayerView>(`/api/games/${gameId}/state`, { token });
  if (r.status !== 200) throw new Error(`state ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
};

export const tick = async (gameId: string, token: string, readUpTo?: string) => {
  const r = await call<PlayerView>(`/api/games/${gameId}/tick`, { token, body: { readUpTo } });
  if (r.status !== 200) throw new Error(`tick ${r.status}: ${JSON.stringify(r.data)}`);
  return r.data;
};

export async function control(gameId: string, hostToken: string, action: string) {
  const v = await state(gameId, hostToken);
  return call(`/api/games/${gameId}/control`, { token: hostToken, body: { action, version: v.game.version } });
}

/** Sposta indietro l'inizio della fase corrente (simula il passare del tempo). */
export async function rewind(gameId: string, seconds: number) {
  const db = admin();
  const { data } = await db.from("games").select("phase_started_at").eq("id", gameId).single();
  const started = Date.parse((data as { phase_started_at: string }).phase_started_at) - seconds * 1000;
  await db.from("games").update({ phase_started_at: new Date(started).toISOString() }).eq("id", gameId);
}

export async function killerSeat(gameId: string, seats: Seat[]): Promise<Seat> {
  for (const seat of seats) {
    const v = await state(gameId, seat.token);
    if (v.mySecret?.isKiller) return seat;
  }
  throw new Error("killer non trovato");
}

export function charOf(view: PlayerView, playerId: string): string {
  return view.characters.find((c) => c.playerId === playerId)!.id;
}
