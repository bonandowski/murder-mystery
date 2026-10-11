import { describe, expect, it } from "vitest";
import {
  computeClock,
  nextPhaseIdx,
  resolveVote,
  shouldAutoAdvance,
  shouldCloseVote,
  voteScoreEvents,
} from "@/lib/game/engine";
import { buildPhasePlan } from "@/lib/game/phases";

const T0 = Date.parse("2026-10-11T20:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

describe("computeClock", () => {
  it("tiene conto di pause ed estensioni", () => {
    const base = { phaseStartedAt: iso(T0), pausedAt: null, pausedTotalSeconds: 0, phaseExtraSeconds: 0, targetSeconds: 600 };
    expect(computeClock(base, T0 + 100_000).remaining).toBe(500);
    const paused = computeClock({ ...base, pausedAt: iso(T0 + 100_000) }, T0 + 400_000);
    expect(paused.elapsed).toBe(100);
    expect(paused.paused).toBe(true);
    expect(paused.expiresAtMs).toBeNull();
    const resumed = computeClock({ ...base, pausedTotalSeconds: 300, phaseExtraSeconds: 300 }, T0 + 700_000);
    expect(resumed.elapsed).toBe(400);
    expect(resumed.total).toBe(900);
    expect(resumed.expiresAtMs).toBe(T0 + 1_200_000);
    expect(computeClock(base, T0 + 601_000).expired).toBe(true);
  });
});

describe("nextPhaseIdx", () => {
  const plan = buildPhasePlan(120);
  const idx = (kind: string, n = 0) => plan.filter((p) => p.kind === kind)[n].idx;

  it("salta la resa dei conti nel flusso normale", () => {
    expect(nextPhaseIdx(plan, idx("act", 2), { killerArrested: false, openSideQuests: 2 })).toBe(idx("final_vote"));
    expect(nextPhaseIdx(plan, idx("final_vote"), { killerArrested: false, openSideQuests: 2 })).toBe(idx("epilogue"));
  });

  it("killer arrestato: resa dei conti se ci sono missioni aperte, altrimenti epilogo", () => {
    expect(nextPhaseIdx(plan, idx("vote"), { killerArrested: true, openSideQuests: 1 })).toBe(idx("showdown"));
    expect(nextPhaseIdx(plan, idx("vote"), { killerArrested: true, openSideQuests: 0 })).toBe(idx("epilogue"));
    expect(nextPhaseIdx(plan, idx("showdown"), { killerArrested: true, openSideQuests: 1 })).toBe(idx("epilogue"));
  });

  it("forceEnd porta all'epilogo; dopo l'epilogo non c'è nulla", () => {
    expect(nextPhaseIdx(plan, 0, { killerArrested: false, openSideQuests: 0, forceEnd: true })).toBe(idx("epilogue"));
    expect(nextPhaseIdx(plan, idx("epilogue"), { killerArrested: false, openSideQuests: 0 })).toBeNull();
  });
});

describe("resolveVote", () => {
  const v = (voter: string, accused: string) => ({ voterPlayerId: voter, accusedCharacterId: accused });
  it("maggioranza relativa, parità e nessun voto", () => {
    expect(resolveVote([v("a", "K"), v("b", "K"), v("c", "X")], "K")).toMatchObject({ kind: "killer", characterId: "K" });
    expect(resolveVote([v("a", "X"), v("b", "X"), v("c", "K")], "K")).toMatchObject({ kind: "innocent", characterId: "X" });
    expect(resolveVote([v("a", "X"), v("b", "K")], "K").kind).toBe("tie");
    expect(resolveVote([], "K").kind).toBe("none");
  });
});

describe("voteScoreEvents", () => {
  it("premia chi indovina e il killer che la scampa", () => {
    const votes = [
      { voterPlayerId: "p1", accusedCharacterId: "K" },
      { voterPlayerId: "p2", accusedCharacterId: "X" },
      { voterPlayerId: "p3", accusedCharacterId: "X" },
      { voterPlayerId: "pk", accusedCharacterId: "X" },
    ];
    const events = voteScoreEvents({
      roundId: "r1", roundNumber: 1, kind: "vote", votes,
      result: { kind: "innocent", characterId: "X", tally: {} },
      killerCharacterId: "K", killerPlayerId: "pk",
    });
    expect(events.find((e) => e.playerId === "p1")?.points).toBe(5);
    expect(events.filter((e) => e.playerId === "pk").reduce((s, e) => s + e.points, 0)).toBe(4);
    expect(events.some((e) => e.playerId === "p2")).toBe(false);
  });
});

describe("auto-avanzamento e chiusura voto", () => {
  const clockExpired = computeClock(
    { phaseStartedAt: iso(T0), pausedAt: null, pausedTotalSeconds: 0, phaseExtraSeconds: 0, targetSeconds: 60 },
    T0 + 300_000,
  );
  it("avanza solo se l'host è offline e la tolleranza è passata", () => {
    const base = { kind: "act" as const, clock: clockExpired, voteClosedAt: null, nowMs: T0 + 300_000 };
    expect(shouldAutoAdvance({ ...base, hostLastSeenAt: iso(T0 + 290_000) })).toBe(false);
    expect(shouldAutoAdvance({ ...base, hostLastSeenAt: iso(T0) })).toBe(true);
    expect(shouldAutoAdvance({ ...base, nowMs: T0 + 200_000, hostLastSeenAt: iso(T0) })).toBe(false);
  });
  it("nelle votazioni aspetta che l'esito resti a schermo", () => {
    const base = { kind: "vote" as const, clock: clockExpired, hostLastSeenAt: null, nowMs: T0 + 300_000 };
    expect(shouldAutoAdvance({ ...base, voteClosedAt: null })).toBe(false);
    expect(shouldAutoAdvance({ ...base, voteClosedAt: iso(T0 + 290_000) })).toBe(false);
    expect(shouldAutoAdvance({ ...base, voteClosedAt: iso(T0 + 200_000) })).toBe(true);
  });
  it("chiude il voto quando votano tutti o scade il tempo", () => {
    const running = computeClock(
      { phaseStartedAt: iso(T0), pausedAt: null, pausedTotalSeconds: 0, phaseExtraSeconds: 0, targetSeconds: 600 },
      T0 + 10_000,
    );
    expect(shouldCloseVote({ votedCount: 5, eligibleCount: 5, clock: running })).toBe(true);
    expect(shouldCloseVote({ votedCount: 3, eligibleCount: 5, clock: running })).toBe(false);
    expect(shouldCloseVote({ votedCount: 3, eligibleCount: 5, clock: clockExpired })).toBe(true);
  });
});
