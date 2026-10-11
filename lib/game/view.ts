import type { PhaseKind } from "./phases";
import type { GameSettings } from "./settings";

/**
 * Stato della partita come lo vede UN giocatore (o la TV).
 * Costruito dal server (lib/server/view.ts): contiene solo ciò che quel
 * giocatore ha diritto di vedere.
 */
export interface PlayerView {
  serverNow: number;
  game: {
    id: string;
    code: string;
    status: "lobby" | "generating" | "ready" | "in_progress" | "ended";
    settings: GameSettings;
    version: number;
    currentPhaseIdx: number | null;
    phaseStartedAt: string | null;
    pausedAt: string | null;
    pausedTotalSeconds: number;
    phaseExtraSeconds: number;
    killerArrested: boolean;
    endingReason: string | null;
    generation: { step: number; error: string | null; attempts: number };
  };
  me: {
    id: string;
    nickname: string;
    isHost: boolean;
    isSpectator: boolean;
    characterId: string | null;
    inboxReadAt: string | null;
  };
  players: {
    id: string;
    nickname: string;
    characterPref: "m" | "f" | "any";
    isHost: boolean;
    isSpectator: boolean;
    online: boolean;
    characterId: string | null;
  }[];
  scenario: {
    title: string;
    setting: string;
    premise: string;
    victimName: string;
    victimDescription: string;
    dressCode: string;
  } | null;
  characters: {
    id: string;
    key: string;
    name: string;
    gender: string;
    role: string;
    publicDescription: string;
    look: string;
    playerId: string | null;
    arrestStatus: "killer" | "exonerated" | null;
  }[];
  mySecret: {
    isKiller: boolean;
    relationToVictim: string;
    backstory: string;
    secret: string;
    alibi: string;
    apparentMotive: string;
    objectives: string[];
    knowledge: { aboutKey: string; fact: string }[];
    killerGuidance: string;
  } | null;
  phases: { idx: number; kind: PhaseKind; actNumber: number | null; title: string; targetSeconds: number }[];
  messages: {
    id: string;
    phaseIdx: number | null;
    kind: string;
    title: string;
    body: string;
    payload: Record<string, unknown>;
    releasedAt: string;
    private: boolean;
  }[];
  sideQuests: {
    id: string;
    targetCharacterId: string;
    description: string;
    points: number;
    status: "open" | "claimed" | "confirmed" | "rejected";
  }[];
  pendingConfirmations: { sideQuestId: string; ownerCharacterId: string; prompt: string }[];
  sideQuestStats: { total: number; confirmed: number };
  vote: {
    roundId: string;
    phaseIdx: number;
    roundNumber: number;
    kind: "vote" | "final_vote";
    status: "open" | "closed";
    eligibleCount: number;
    votedCount: number;
    myVoteCharacterId: string | null;
    canVote: boolean;
    accusableIds: string[];
    closedAt: string | null;
    result: { kind: "killer" | "innocent" | "tie" | "none"; characterId: string | null; tally: Record<string, number> } | null;
  } | null;
  scores: { playerId: string; nickname: string; characterId: string | null; points: number; reasons: { reason: string; points: number }[] }[] | null;
  solution: {
    killerCharacterId: string;
    motive: string;
    method: string;
    explanation: string;
    timeline: { time: string; event: string }[];
  } | null;
  /** Prossimo rilascio programmato di messaggi (ms epoch), per far partire un tick puntuale. */
  nextReleaseAt: number | null;
  /** True se manca un LLM configurato e si usa la storia di esempio. */
  demoStory: boolean;
}
