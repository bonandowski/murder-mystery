import { describe, expect, it } from "vitest";
import { actsForDuration, buildPhasePlan, momentOffset } from "@/lib/game/phases";

describe("buildPhasePlan", () => {
  it.each([60, 90, 120, 150, 180])("rispetta la durata indicativa per %i minuti", (min) => {
    const plan = buildPhasePlan(min);
    const normalFlow = plan.filter((p) => p.kind !== "showdown");
    const total = normalFlow.reduce((s, p) => s + p.targetSeconds, 0);
    expect(Math.abs(total - min * 60)).toBeLessThanOrEqual(5 * 60);
  });

  it("alterna atti e votazioni e chiude con accusa finale, resa dei conti, epilogo", () => {
    const kinds = buildPhasePlan(120).map((p) => p.kind);
    expect(kinds).toEqual(["prologue", "act", "vote", "act", "vote", "act", "final_vote", "showdown", "epilogue"]);
    expect(buildPhasePlan(60).filter((p) => p.kind === "act")).toHaveLength(2);
    expect(buildPhasePlan(180).filter((p) => p.kind === "act")).toHaveLength(4);
  });

  it("usa i titoli degli atti", () => {
    const plan = buildPhasePlan(90, ["La festa", "Il veleno", "La verità"]);
    expect(plan.find((p) => p.actNumber === 2 && p.kind === "act")?.title).toBe("Atto II — Il veleno");
    expect(actsForDuration(90)).toBe(3);
  });

  it("calcola gli offset dei momenti", () => {
    expect(momentOffset("start", 1000)).toBe(0);
    expect(momentOffset("middle", 1000, 0)).toBe(350);
    expect(momentOffset("late", 1000, 1)).toBe(715);
  });
});
