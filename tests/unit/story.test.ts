import { describe, expect, it } from "vitest";
import { buildStoryRows } from "@/lib/game/build";
import { characterKeys, type GenerationContext } from "@/lib/game/schemas";
import { DEFAULT_SETTINGS } from "@/lib/game/settings";
import { namesKillerAsGuilty, validateDetails, validatePlot, validateScript } from "@/lib/game/validate";
import { mockDetails, mockPlot, mockScript } from "@/lib/llm/mockStory";

function ctxFor(n: number, overrides: Partial<GenerationContext> = {}): GenerationContext {
  const keys = characterKeys(n);
  return {
    playerCount: n,
    acts: 3,
    killerKey: keys[n - 1],
    genders: keys.map((_, i) => (i % 3 === 0 ? "f" : i % 3 === 1 ? "m" : "x")),
    sideQuestsPer: 1,
    redHerrings: 3,
    settingDescription: "Villa anni '20",
    tone: "classico",
    difficulty: "medium",
    durationMin: 120,
    notes: "",
    assignment: keys.map((key, i) => ({ key, playerId: `player-${i}` })),
    ...overrides,
  };
}

describe("storia mock + validatori", () => {
  it.each([4, 6, 10])("con %i giocatori la storia mock è valida", (n) => {
    const ctx = ctxFor(n);
    const plot = mockPlot(ctx);
    expect(validatePlot(plot, ctx)).toEqual([]);
    const details = mockDetails(ctx, plot);
    expect(validateDetails(details, plot, ctx)).toEqual([]);
    const script = mockScript(ctx, plot);
    expect(validateScript(script, plot, ctx)).toEqual([]);
  });

  it("valida anche difficoltà facile e difficile, 2 e 4 atti", () => {
    for (const [difficulty, sideQuestsPer, redHerrings, acts] of [["easy", 0, 1, 2], ["hard", 2, 4, 4]] as const) {
      const ctx = ctxFor(5, { difficulty, sideQuestsPer, redHerrings, acts });
      const plot = mockPlot(ctx);
      expect(validatePlot(plot, ctx)).toEqual([]);
      expect(validateDetails(mockDetails(ctx, plot), plot, ctx)).toEqual([]);
      expect(validateScript(mockScript(ctx, plot), plot, ctx)).toEqual([]);
    }
  });

  it("segnala killer sbagliato, indizi non consegnati e side quest su sé stessi", () => {
    const ctx = ctxFor(5);
    const plot = mockPlot(ctx);
    expect(validatePlot({ ...plot, killerKey: "C1" }, ctx).join(" ")).toMatch(/killer deve essere C5/);
    const details = mockDetails(ctx, plot);
    details.characters[0].sideQuests[0].targetKey = details.characters[0].key;
    expect(validateDetails(details, plot, ctx).join(" ")).toMatch(/altro personaggio/);
    const script = mockScript(ctx, plot);
    script.acts.forEach((a) => (a.messages = a.messages.filter((m) => m.clueId !== "K1")));
    expect(validateScript(script, plot, ctx).join(" ")).toMatch(/K1 non viene mai consegnato/);
  });

  it("riconosce un messaggio che accusa esplicitamente il killer", () => {
    expect(namesKillerAsGuilty("Ormai è chiaro: {{C3}} è l'assassino.", "C3", [])).toBe(true);
    expect(namesKillerAsGuilty("Chiedi a {{C3}} dove era alle 22.", "C3", [])).toBe(false);
    expect(namesKillerAsGuilty("La contessa Bianchi è la colpevole!", "C3", ["Bianchi"])).toBe(true);
  });

  it("costruisce le righe del database", () => {
    const ctx = ctxFor(6);
    const plot = mockPlot(ctx);
    let n = 0;
    const rows = buildStoryRows({
      ctx, settings: DEFAULT_SETTINGS, plot, details: mockDetails(ctx, plot), script: mockScript(ctx, plot),
      newId: () => `id-${n++}`,
    });
    expect(rows.characters).toHaveLength(6);
    expect(rows.characters.every((c) => c.player_id?.startsWith("player-"))).toBe(true);
    expect(rows.secrets.filter((s) => s.is_killer)).toHaveLength(1);
    expect(rows.solution.killer_character_id).toBe(rows.characters.find((c) => c.key === "C6")!.id);
    expect(rows.sideQuests).toHaveLength(6);
    expect(rows.phases.map((p) => p.kind)).toContain("epilogue");
    const epilogueIdx = rows.phases.find((p) => p.kind === "epilogue")!.idx;
    expect(rows.messages.some((m) => m.phase_idx === epilogueIdx && m.kind === "narration")).toBe(true);
    // ogni messaggio di atto arriva prima dell'avviso di voto
    for (const phase of rows.phases.filter((p) => p.kind === "act")) {
      for (const m of rows.messages.filter((m) => m.phase_idx === phase.idx)) {
        expect(m.offset_seconds).toBeLessThan(phase.target_seconds);
      }
    }
  });
});
