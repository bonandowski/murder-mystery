import { buildPhasePlan, momentOffset, VOTE_WARNING_SECONDS, type PhaseSpec } from "./phases";
import type { Details, GenerationContext, Plot, Script } from "./schemas";
import { sideQuestPoints, type GameSettings } from "./settings";

/**
 * Trasforma l'output (validato) dei tre step in righe pronte per il database.
 * Funzione pura: gli id sono generati da `newId` per poterla testare.
 */
export interface StoryRows {
  scenario: {
    title: string;
    setting: string;
    premise: string;
    victim_name: string;
    victim_description: string;
    dress_code: string;
  };
  characters: {
    id: string;
    player_id: string | null;
    key: string;
    name: string;
    gender: string;
    role: string;
    public_description: string;
    look: string;
    sort_order: number;
  }[];
  secrets: {
    character_id: string;
    is_killer: boolean;
    relation_to_victim: string;
    backstory: string;
    secret: string;
    alibi: string;
    apparent_motive: string;
    objectives: string[];
    knowledge: { aboutKey: string; fact: string }[];
    killer_guidance: string;
    exoneration_reveal: string;
  }[];
  solution: {
    killer_character_id: string;
    motive: string;
    method: string;
    timeline: { time: string; event: string }[];
    explanation: string;
    key_clues: { id: string; text: string }[];
  };
  phases: { idx: number; kind: PhaseSpec["kind"]; act_number: number | null; title: string; target_seconds: number }[];
  messages: {
    phase_idx: number;
    offset_seconds: number;
    recipient_character_id: string | null;
    kind: string;
    title: string;
    body: string;
    payload: Record<string, unknown>;
  }[];
  sideQuests: {
    owner_character_id: string;
    target_character_id: string;
    description: string;
    target_prompt: string;
    points: number;
  }[];
}

export function buildStoryRows(args: {
  ctx: GenerationContext;
  settings: GameSettings;
  plot: Plot;
  details: Details;
  script: Script;
  newId: () => string;
}): StoryRows {
  const { ctx, settings, plot, details, script, newId } = args;
  const playerByKey = new Map(ctx.assignment.map((a) => [a.key, a.playerId]));
  const idByKey = new Map<string, string>();
  const characters = plot.characters.map((c, i) => {
    const id = newId();
    idByKey.set(c.key, id);
    return {
      id,
      player_id: playerByKey.get(c.key) ?? null,
      key: c.key,
      name: c.name,
      gender: c.gender,
      role: c.role,
      public_description: c.publicDescription,
      look: c.look,
      sort_order: i,
    };
  });
  const charId = (key: string) => {
    const id = idByKey.get(key);
    if (!id) throw new Error(`Personaggio sconosciuto: ${key}`);
    return id;
  };
  const detailByKey = new Map(details.characters.map((d) => [d.key, d]));

  const secrets = plot.characters.map((c) => {
    const d = detailByKey.get(c.key);
    const isKiller = c.key === plot.killerKey;
    return {
      character_id: charId(c.key),
      is_killer: isKiller,
      relation_to_victim: c.relationToVictim,
      backstory: d?.backstory ?? "",
      secret: c.secret,
      alibi: c.alibi,
      apparent_motive: c.apparentMotive,
      objectives: d?.objectives ?? [],
      knowledge: d?.knowledge ?? [],
      killer_guidance: isKiller ? (d?.killerGuidance ?? "") : "",
      exoneration_reveal: isKiller ? "" : (d?.exonerationReveal || c.secret),
    };
  });

  const phases = buildPhasePlan(ctx.durationMin, plot.acts.map((a) => a.title));
  const messages: StoryRows["messages"] = [];
  const all = null;

  for (const phase of phases) {
    const p = phase.idx;
    switch (phase.kind) {
      case "prologue": {
        messages.push({
          phase_idx: p, offset_seconds: 0, recipient_character_id: all, kind: "narration",
          title: plot.title, body: script.prologueNarration, payload: {},
        });
        for (const c of plot.characters) {
          const first = detailByKey.get(c.key)?.objectives[0];
          if (!first) continue;
          messages.push({
            phase_idx: p, offset_seconds: 60, recipient_character_id: charId(c.key), kind: "hint",
            title: "Il tuo primo obiettivo", body: first, payload: {},
          });
        }
        break;
      }
      case "act": {
        const act = script.acts.find((a) => a.number === phase.actNumber);
        if (!act) break;
        messages.push({
          phase_idx: p, offset_seconds: 0, recipient_character_id: all, kind: "narration",
          title: phase.title, body: act.narration, payload: {},
        });
        act.messages.forEach((m, i) => {
          messages.push({
            phase_idx: p,
            offset_seconds: Math.min(momentOffset(m.moment, phase.targetSeconds, i), phase.targetSeconds - VOTE_WARNING_SECONDS - 30),
            recipient_character_id: m.toKey === "ALL" ? all : charId(m.toKey),
            kind: m.kind,
            title: m.title,
            body: m.body,
            payload: m.clueId ? { clueId: m.clueId } : {},
          });
        });
        const next = phases[phase.idx + 1];
        messages.push({
          phase_idx: p,
          offset_seconds: Math.max(0, phase.targetSeconds - VOTE_WARNING_SECONDS),
          recipient_character_id: all,
          kind: "system",
          title: next?.kind === "final_vote" ? "Tra 2 minuti: accusa finale" : "Tra 2 minuti si vota",
          body:
            next?.kind === "final_vote"
              ? "Ultimi due minuti per mettere insieme gli indizi: poi l'accusa finale, senza appello."
              : "Due minuti alla votazione: confrontatevi e decidete chi arrestare.",
          payload: {},
        });
        break;
      }
      case "vote":
        messages.push({
          phase_idx: p, offset_seconds: 0, recipient_character_id: all, kind: "system",
          title: "Votazione aperta",
          body: "Votate chi arrestare. Vince la maggioranza; in caso di parità nessuno finisce in manette.",
          payload: {},
        });
        break;
      case "final_vote":
        messages.push({
          phase_idx: p, offset_seconds: 0, recipient_character_id: all, kind: "system",
          title: "Accusa finale",
          body: "È l'ultima occasione: indicate il colpevole. Dopo questo voto la verità verrà svelata.",
          payload: {},
        });
        break;
      case "showdown":
        messages.push({
          phase_idx: p, offset_seconds: 0, recipient_character_id: all, kind: "narration",
          title: phase.title, body: script.showdownNarration, payload: {},
        });
        messages.push({
          phase_idx: p, offset_seconds: 5, recipient_character_id: all, kind: "system",
          title: "Ultime missioni",
          body: "Il colpevole è stato preso: completate le vostre missioni segrete prima dell'epilogo.",
          payload: {},
        });
        break;
      case "epilogue":
        messages.push({
          phase_idx: p, offset_seconds: 0, recipient_character_id: all, kind: "narration",
          title: "La verità", body: script.epilogueNarration, payload: {},
        });
        break;
    }
  }

  const points = sideQuestPoints(settings.difficulty);
  const sideQuests = details.characters.flatMap((d) =>
    d.sideQuests.map((sq) => ({
      owner_character_id: charId(d.key),
      target_character_id: charId(sq.targetKey),
      description: sq.description,
      target_prompt: sq.targetPrompt,
      points,
    })),
  );

  return {
    scenario: {
      title: plot.title,
      setting: plot.setting,
      premise: plot.premise,
      victim_name: plot.victim.name,
      victim_description: plot.victim.description,
      dress_code: plot.dressCode,
    },
    characters,
    secrets,
    solution: {
      killer_character_id: charId(plot.killerKey),
      motive: plot.crime.motive,
      method: `${plot.crime.method} — ${plot.crime.place}, ${plot.crime.time}`,
      timeline: plot.timeline,
      explanation: plot.solution,
      key_clues: plot.keyClues.map((k) => ({ id: k.id, text: k.text })),
    },
    phases: phases.map((p) => ({
      idx: p.idx,
      kind: p.kind,
      act_number: p.actNumber,
      title: p.title,
      target_seconds: p.targetSeconds,
    })),
    messages,
    sideQuests,
  };
}
