import type { PhaseKind } from "./phases";

/** Dopo quanti secondi senza heartbeat l'host è considerato offline. */
export const HOST_OFFLINE_SECONDS = 90;
/** Tolleranza dopo lo scadere del timer prima dell'avanzamento automatico (host offline). */
export const AUTO_ADVANCE_GRACE_SECONDS = 180;
/** Per quanto resta a schermo l'esito di un voto prima dell'avanzamento automatico (host offline). */
export const VOTE_RESULT_DISPLAY_SECONDS = 45;
/** Un giocatore è "online" se ha fatto heartbeat negli ultimi N secondi. */
export const ONLINE_SECONDS = 60;

// ---------------------------------------------------------------------------
// Orologio
// ---------------------------------------------------------------------------

export interface ClockInput {
  phaseStartedAt: string | null;
  pausedAt: string | null;
  pausedTotalSeconds: number;
  phaseExtraSeconds: number;
  targetSeconds: number;
}

export interface Clock {
  elapsed: number;
  total: number;
  remaining: number;
  expired: boolean;
  paused: boolean;
  /** Istante (ms epoch) di scadenza; null se in pausa o non avviato. */
  expiresAtMs: number | null;
}

export function computeClock(c: ClockInput, nowMs: number): Clock {
  const total = c.targetSeconds + c.phaseExtraSeconds;
  if (!c.phaseStartedAt) {
    return { elapsed: 0, total, remaining: total, expired: false, paused: false, expiresAtMs: null };
  }
  const started = Date.parse(c.phaseStartedAt);
  const pausedNow = c.pausedAt ? Math.max(0, (nowMs - Date.parse(c.pausedAt)) / 1000) : 0;
  const elapsed = Math.max(0, (nowMs - started) / 1000 - c.pausedTotalSeconds - pausedNow);
  const remaining = Math.max(0, total - elapsed);
  return {
    elapsed,
    total,
    remaining,
    expired: elapsed >= total,
    paused: Boolean(c.pausedAt),
    expiresAtMs: c.pausedAt ? null : started + (c.pausedTotalSeconds + total) * 1000,
  };
}

// ---------------------------------------------------------------------------
// Transizioni di fase
// ---------------------------------------------------------------------------

export interface PhaseRef {
  idx: number;
  kind: PhaseKind;
}

export interface FlowFlags {
  killerArrested: boolean;
  openSideQuests: number;
  forceEnd?: boolean;
}

/** Indice della fase successiva, o null se la partita è finita. */
export function nextPhaseIdx(phases: PhaseRef[], currentIdx: number, flags: FlowFlags): number | null {
  const sorted = [...phases].sort((a, b) => a.idx - b.idx);
  const current = sorted.find((p) => p.idx === currentIdx);
  const epilogue = sorted.find((p) => p.kind === "epilogue");
  const showdown = sorted.find((p) => p.kind === "showdown");
  if (!current || !epilogue) return null;
  if (current.kind === "epilogue") return null;
  if (flags.forceEnd) return epilogue.idx;
  if (current.kind === "final_vote" || current.kind === "showdown") return epilogue.idx;
  if (flags.killerArrested) {
    return flags.openSideQuests > 0 && showdown ? showdown.idx : epilogue.idx;
  }
  const next = sorted.find((p) => p.idx > currentIdx && p.kind !== "showdown");
  return next ? next.idx : epilogue.idx;
}

export function isVotePhase(kind: PhaseKind): kind is "vote" | "final_vote" {
  return kind === "vote" || kind === "final_vote";
}

// ---------------------------------------------------------------------------
// Votazioni
// ---------------------------------------------------------------------------

export interface CastVote {
  voterPlayerId: string;
  accusedCharacterId: string;
}

export type VoteResultKind = "killer" | "innocent" | "tie" | "none";

export interface VoteResult {
  kind: VoteResultKind;
  characterId: string | null;
  tally: Record<string, number>;
}

/** Maggioranza relativa; parità in testa = nessun arresto. */
export function resolveVote(votes: CastVote[], killerCharacterId: string): VoteResult {
  const tally: Record<string, number> = {};
  for (const v of votes) tally[v.accusedCharacterId] = (tally[v.accusedCharacterId] ?? 0) + 1;
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return { kind: "none", characterId: null, tally };
  if (entries.length > 1 && entries[0][1] === entries[1][1]) return { kind: "tie", characterId: null, tally };
  const characterId = entries[0][0];
  return { kind: characterId === killerCharacterId ? "killer" : "innocent", characterId, tally };
}

/** Personaggi che si possono ancora accusare. */
export function accusableCharacterIds(
  characters: { id: string; arrestStatus: string | null }[],
): string[] {
  return characters.filter((c) => c.arrestStatus === null).map((c) => c.id);
}

export interface ScoreEvent {
  playerId: string;
  points: number;
  reason: string;
  dedupeKey: string;
}

export const POINTS = {
  correctVoteFirst: 5,
  correctVoteLater: 3,
  correctVoteFinal: 2,
  killerSurvivesVote: 2,
  killerFramesInnocent: 2,
  killerNeverCaught: 5,
} as const;

export function voteScoreEvents(args: {
  roundId: string;
  roundNumber: number;
  kind: "vote" | "final_vote";
  votes: CastVote[];
  result: VoteResult;
  killerCharacterId: string;
  killerPlayerId: string | null;
}): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  const correctPoints =
    args.kind === "final_vote"
      ? POINTS.correctVoteFinal
      : args.roundNumber === 1
        ? POINTS.correctVoteFirst
        : POINTS.correctVoteLater;
  for (const v of args.votes) {
    if (v.accusedCharacterId === args.killerCharacterId && v.voterPlayerId !== args.killerPlayerId) {
      events.push({
        playerId: v.voterPlayerId,
        points: correctPoints,
        reason: args.kind === "final_vote" ? "Accusa finale corretta" : `Voto corretto (votazione ${args.roundNumber})`,
        dedupeKey: `vote:${args.roundId}:${v.voterPlayerId}`,
      });
    }
  }
  if (args.killerPlayerId && args.result.kind !== "killer") {
    events.push({
      playerId: args.killerPlayerId,
      points: POINTS.killerSurvivesVote,
      reason: "Il killer è sfuggito a una votazione",
      dedupeKey: `survive:${args.roundId}`,
    });
    if (args.result.kind === "innocent") {
      events.push({
        playerId: args.killerPlayerId,
        points: POINTS.killerFramesInnocent,
        reason: "Un innocente è finito in manette",
        dedupeKey: `frame:${args.roundId}`,
      });
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Avanzamento automatico (rete di sicurezza se l'host sparisce)
// ---------------------------------------------------------------------------

export function isOnline(lastSeenAt: string | null, nowMs: number, windowSeconds = ONLINE_SECONDS): boolean {
  if (!lastSeenAt) return false;
  return nowMs - Date.parse(lastSeenAt) <= windowSeconds * 1000;
}

export function shouldAutoAdvance(args: {
  kind: PhaseKind;
  clock: Clock;
  hostLastSeenAt: string | null;
  voteClosedAt: string | null;
  nowMs: number;
}): boolean {
  if (args.kind === "epilogue" || args.clock.paused) return false;
  if (isOnline(args.hostLastSeenAt, args.nowMs, HOST_OFFLINE_SECONDS)) return false;
  if (isVotePhase(args.kind)) {
    if (!args.voteClosedAt) return false;
    return args.nowMs - Date.parse(args.voteClosedAt) >= VOTE_RESULT_DISPLAY_SECONDS * 1000;
  }
  if (!args.clock.expired || args.clock.expiresAtMs === null) return false;
  return args.nowMs >= args.clock.expiresAtMs + AUTO_ADVANCE_GRACE_SECONDS * 1000;
}

/** Il voto va chiuso se hanno votato tutti o se il tempo è scaduto. */
export function shouldCloseVote(args: { votedCount: number; eligibleCount: number; clock: Clock }): boolean {
  if (args.eligibleCount > 0 && args.votedCount >= args.eligibleCount) return true;
  return args.clock.expired && !args.clock.paused;
}
