export type PhaseKind = "prologue" | "act" | "vote" | "final_vote" | "showdown" | "epilogue";

export interface PhaseSpec {
  idx: number;
  kind: PhaseKind;
  actNumber: number | null;
  title: string;
  targetSeconds: number;
}

const ROMAN = ["I", "II", "III", "IV", "V"];

export function actsForDuration(durationMin: number): number {
  if (durationMin <= 60) return 2;
  if (durationMin < 150) return 3;
  return 4;
}

/**
 * Scaletta della serata: Prologo → Atto I → Voto → … → Ultimo atto → Accusa finale
 * → (Resa dei conti, solo se il killer viene preso con side quest aperte) → Epilogo.
 * Il tempo restante dopo prologo, voti ed epilogo è diviso equamente tra gli atti.
 */
export function buildPhasePlan(durationMin: number, actTitles: string[] = []): PhaseSpec[] {
  const acts = actsForDuration(durationMin);
  const short = durationMin <= 60;
  const prologue = (short ? 5 : durationMin <= 90 ? 8 : 10) * 60;
  const vote = (short ? 3 : 4) * 60;
  const finalVote = 5 * 60;
  const showdown = (short ? 6 : 10) * 60;
  const epilogue = (short ? 6 : 10) * 60;
  const votes = acts - 1;
  const actTotal = durationMin * 60 - prologue - votes * vote - finalVote - epilogue;
  const actSeconds = Math.max(10 * 60, Math.round(actTotal / acts / 60) * 60);

  const plan: Omit<PhaseSpec, "idx">[] = [
    { kind: "prologue", actNumber: null, title: "Prologo", targetSeconds: prologue },
  ];
  for (let a = 1; a <= acts; a++) {
    const subtitle = actTitles[a - 1]?.trim();
    plan.push({
      kind: "act",
      actNumber: a,
      title: `Atto ${ROMAN[a - 1]}${subtitle ? ` — ${subtitle}` : ""}`,
      targetSeconds: actSeconds,
    });
    if (a < acts) {
      plan.push({ kind: "vote", actNumber: a, title: `Votazione ${ROMAN[a - 1]}`, targetSeconds: vote });
    }
  }
  plan.push({ kind: "final_vote", actNumber: null, title: "Accusa finale", targetSeconds: finalVote });
  plan.push({ kind: "showdown", actNumber: null, title: "Resa dei conti", targetSeconds: showdown });
  plan.push({ kind: "epilogue", actNumber: null, title: "Epilogo", targetSeconds: epilogue });
  return plan.map((p, idx) => ({ ...p, idx }));
}

export type MessageMoment = "start" | "middle" | "late";

/** Offset (secondi dall'inizio dell'atto) per un momento dell'atto, con un piccolo sfasamento. */
export function momentOffset(moment: MessageMoment, actSeconds: number, jitterSeed = 0): number {
  const base = moment === "start" ? 0 : moment === "middle" ? 0.35 : 0.7;
  const jitter = moment === "start" ? 0 : (Math.abs(jitterSeed) % 4) * 15;
  return Math.round(actSeconds * base) + jitter;
}

export const VOTE_WARNING_SECONDS = 120;
