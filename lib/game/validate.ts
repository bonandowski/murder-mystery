import { characterKeys, type Details, type GenerationContext, type Plot, type Script } from "./schemas";

/**
 * Controlli di coerenza sull'output del modello. Ogni funzione restituisce una
 * lista di errori leggibili (in italiano) che vengono rimandati al modello in
 * caso di nuovo tentativo.
 */

const ACCUSATION_WORDS = /\b(assassin[oa]|colpevole|omicida|killer|ha ucciso|l'ha ucciso|l'ha uccisa)\b/i;

export function validatePlot(plot: Plot, ctx: GenerationContext): string[] {
  const errors: string[] = [];
  const keys = characterKeys(ctx.playerCount);
  const keySet = new Set(keys);
  const got = plot.characters.map((c) => c.key);

  if (plot.characters.length !== ctx.playerCount) {
    errors.push(`Servono esattamente ${ctx.playerCount} personaggi (C1…C${ctx.playerCount}), ne hai creati ${plot.characters.length}.`);
  }
  for (const k of keys) {
    if (!got.includes(k)) errors.push(`Manca il personaggio ${k}.`);
  }
  if (new Set(got).size !== got.length) errors.push("Le chiavi dei personaggi devono essere uniche.");
  const names = plot.characters.map((c) => c.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) errors.push("I nomi dei personaggi devono essere tutti diversi.");
  if (plot.killerKey !== ctx.killerKey) {
    errors.push(`Il killer deve essere ${ctx.killerKey}, non ${plot.killerKey}.`);
  }
  plot.characters.forEach((c) => {
    const idx = keys.indexOf(c.key);
    const wanted = idx >= 0 ? ctx.genders[idx] : undefined;
    if (wanted && wanted !== "x" && c.gender !== wanted) {
      errors.push(`${c.key} deve essere di genere "${wanted}".`);
    }
  });

  const minClues = ctx.difficulty === "easy" ? 3 : 4;
  if (plot.keyClues.length < minClues || plot.keyClues.length > 7) {
    errors.push(`Servono tra ${minClues} e 6 indizi chiave, ne hai ${plot.keyClues.length}.`);
  }
  const holders = new Set<string>();
  for (const clue of plot.keyClues) {
    if (!keySet.has(clue.holderKey)) errors.push(`L'indizio ${clue.id} ha un possessore inesistente (${clue.holderKey}).`);
    if (clue.holderKey === ctx.killerKey) errors.push(`L'indizio chiave ${clue.id} non può essere in mano al killer.`);
    if (clue.act < 1 || clue.act > ctx.acts) errors.push(`L'indizio ${clue.id} deve uscire in un atto tra 1 e ${ctx.acts}.`);
    holders.add(clue.holderKey);
  }
  const minHolders = Math.min(3, ctx.playerCount - 1);
  if (holders.size < minHolders) {
    errors.push(`Gli indizi chiave devono essere distribuiti tra almeno ${minHolders} personaggi diversi.`);
  }
  if (new Set(plot.keyClues.map((c) => c.id)).size !== plot.keyClues.length) {
    errors.push("Gli id degli indizi chiave devono essere unici.");
  }

  if (plot.redHerrings.length < Math.max(1, ctx.redHerrings - 1)) {
    errors.push(`Servono almeno ${ctx.redHerrings} depistaggi.`);
  }
  for (const rh of plot.redHerrings) {
    if (!keySet.has(rh.suspectKey) || !keySet.has(rh.holderKey)) {
      errors.push(`Il depistaggio ${rh.id} fa riferimento a personaggi inesistenti.`);
    }
    if (rh.suspectKey === ctx.killerKey) errors.push(`Il depistaggio ${rh.id} deve puntare a un innocente.`);
  }

  if (plot.acts.length !== ctx.acts) errors.push(`Servono esattamente ${ctx.acts} atti, ne hai ${plot.acts.length}.`);
  plot.acts.forEach((a, i) => {
    if (a.number !== i + 1) errors.push(`Gli atti devono essere numerati 1…${ctx.acts} in ordine.`);
  });

  for (const r of plot.relationships) {
    if (!keySet.has(r.a) || !keySet.has(r.b)) errors.push(`Relazione con personaggi inesistenti: ${r.a}-${r.b}.`);
  }
  if (plot.relationships.length < ctx.playerCount) {
    errors.push(`Servono almeno ${ctx.playerCount} relazioni tra i personaggi.`);
  }
  if (!plot.solution.trim()) errors.push("Manca la spiegazione della soluzione.");
  return dedupe(errors);
}

export function validateDetails(details: Details, plot: Plot, ctx: GenerationContext): string[] {
  const errors: string[] = [];
  const keys = characterKeys(ctx.playerCount);
  const keySet = new Set(keys);
  for (const k of keys) {
    const matches = details.characters.filter((c) => c.key === k);
    if (matches.length !== 1) errors.push(`Il personaggio ${k} deve comparire esattamente una volta.`);
  }
  for (const c of details.characters) {
    if (!keySet.has(c.key)) errors.push(`Personaggio inesistente: ${c.key}.`);
    if (!c.backstory.trim()) errors.push(`${c.key}: manca la backstory.`);
    if (c.objectives.length < 2) errors.push(`${c.key}: servono almeno 2 obiettivi.`);
    const isKiller = c.key === plot.killerKey;
    if (isKiller && !c.killerGuidance.trim()) errors.push(`${c.key} è il killer: serve killerGuidance.`);
    if (!isKiller && !c.exonerationReveal.trim()) errors.push(`${c.key}: serve exonerationReveal.`);
    if (c.sideQuests.length !== ctx.sideQuestsPer) {
      errors.push(`${c.key}: servono esattamente ${ctx.sideQuestsPer} side quest, ne ha ${c.sideQuests.length}.`);
    }
    for (const sq of c.sideQuests) {
      if (!keySet.has(sq.targetKey)) errors.push(`${c.key}: side quest con bersaglio inesistente (${sq.targetKey}).`);
      if (sq.targetKey === c.key) errors.push(`${c.key}: il bersaglio di una side quest deve essere un altro personaggio.`);
      if (!sq.targetPrompt.trim()) errors.push(`${c.key}: ogni side quest deve avere targetPrompt.`);
    }
  }
  return dedupe(errors);
}

export function validateScript(script: Script, plot: Plot, ctx: GenerationContext): string[] {
  const errors: string[] = [];
  const keys = characterKeys(ctx.playerCount);
  const keySet = new Set(keys);
  const killer = plot.characters.find((c) => c.key === plot.killerKey);
  const killerNames = killer ? nameVariants(killer.name) : [];

  if (script.acts.length !== ctx.acts) errors.push(`Servono esattamente ${ctx.acts} atti nel copione.`);
  const deliveredClues = new Set<string>();
  script.acts.forEach((act, i) => {
    if (act.number !== i + 1) errors.push("Gli atti del copione devono essere numerati in ordine.");
    if (!act.narration.trim()) errors.push(`Atto ${act.number}: manca la narrazione.`);
    for (const k of keys) {
      if (!act.messages.some((m) => m.toKey === k)) {
        errors.push(`Atto ${act.number}: ${k} non riceve nessun messaggio (ognuno deve riceverne almeno uno per atto).`);
      }
    }
    for (const m of act.messages) {
      if (m.toKey !== "ALL" && !keySet.has(m.toKey)) errors.push(`Atto ${act.number}: destinatario inesistente ${m.toKey}.`);
      if (m.kind === "killer_tip" && m.toKey !== plot.killerKey) {
        errors.push(`Atto ${act.number}: i messaggi killer_tip vanno solo al killer (${plot.killerKey}).`);
      }
      if (m.clueId) deliveredClues.add(m.clueId);
      if (m.toKey !== plot.killerKey && namesKillerAsGuilty(`${m.title}. ${m.body}`, plot.killerKey, killerNames)) {
        errors.push(`Atto ${act.number}: un messaggio rivela esplicitamente il killer. Gli indizi devono suggerire, non accusare.`);
      }
    }
    if (namesKillerAsGuilty(act.narration, plot.killerKey, killerNames)) {
      errors.push(`Atto ${act.number}: la narrazione rivela il killer.`);
    }
  });
  for (const clue of plot.keyClues) {
    if (!deliveredClues.has(clue.id)) {
      errors.push(`L'indizio chiave ${clue.id} non viene mai consegnato: aggiungi un messaggio kind "clue" con clueId "${clue.id}" a ${clue.holderKey}.`);
    }
  }
  if (namesKillerAsGuilty(script.prologueNarration, plot.killerKey, killerNames)) {
    errors.push("La narrazione del prologo rivela il killer.");
  }
  if (!script.epilogueNarration.trim()) errors.push("Manca la narrazione dell'epilogo.");
  return dedupe(errors);
}

function nameVariants(fullName: string): string[] {
  const parts = fullName
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}']/gu, ""))
    .filter((p) => p.length >= 4 && !/^(dott|dottor|dottoressa|signor|signora|conte|contessa|don|donna|lady|lord|sir|madame|monsieur|capitano|professor|professoressa)$/i.test(p));
  return [fullName, ...parts];
}

/** True se una frase cita il killer insieme a parole che lo accusano. */
export function namesKillerAsGuilty(text: string, killerKey: string, killerNames: string[]): boolean {
  const sentences = text.split(/(?<=[.!?])\s+/);
  return sentences.some((s) => {
    if (!ACCUSATION_WORDS.test(s)) return false;
    if (s.includes(`{{${killerKey}}}`)) return true;
    return killerNames.some((n) => n && s.toLowerCase().includes(n.toLowerCase()));
  });
}

function dedupe(list: string[]): string[] {
  return [...new Set(list)];
}
