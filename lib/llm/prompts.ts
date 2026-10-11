import { characterKeys, type Details, type GenerationContext, type Plot } from "@/lib/game/schemas";

export const SYSTEM_PROMPT = `Sei un game designer esperto di cene con delitto dal vivo, in italiano.
Scrivi misteri giocabili a tavola tra amici: i giocatori interpretano i personaggi, parlano, mentono e indagano.
Il telefono di ciascuno mostra solo la sua scheda e brevi suggerimenti: il divertimento nasce dalle conversazioni.

Regole di design irrinunciabili:
- La storia deve essere coerente e risolvibile: la catena di indizi chiave porta in modo univoco al killer.
- Gli indizi chiave sono spezzati tra più personaggi: nessuno da solo può risolvere il caso, devono parlarsi.
- Ogni innocente ha un segreto da nascondere e un movente apparente, così tutti sembrano sospettabili.
- Ogni personaggio ha motivi concreti per parlare con almeno due altri personaggi.
- Il killer sa di esserlo: ha un alibi falso e strumenti per depistare.
- Nessun testo destinato agli innocenti nomina esplicitamente il killer come colpevole: gli indizi suggeriscono, non accusano.
- Quando citi un personaggio nei testi usa SEMPRE il token {{Ck}} (es. {{C3}}), mai solo il nome: verrà mostrato come "Nome (giocatore)".
- Testi brevi, vividi, azionabili; seconda persona ("Sei…", "Vai da…") nelle parti private.
- Contenuti adatti a una cena tra amici: niente violenza esplicita.
Rispondi solo con JSON valido conforme allo schema.`;

function header(ctx: GenerationContext): string {
  const keys = characterKeys(ctx.playerCount);
  const genders = keys
    .map((k, i) => `${k}: ${ctx.genders[i] === "m" ? "uomo" : ctx.genders[i] === "f" ? "donna" : "libero"}`)
    .join(", ");
  return [
    `Ambientazione: ${ctx.settingDescription}`,
    `Tono: ${ctx.tone}`,
    `Durata della serata: circa ${ctx.durationMin} minuti, divisa in ${ctx.acts} atti.`,
    `Difficoltà: ${ctx.difficulty === "easy" ? "facile" : ctx.difficulty === "medium" ? "media" : "difficile"}.`,
    `Personaggi: esattamente ${ctx.playerCount}, chiavi ${keys.join(", ")}. Genere richiesto → ${genders}.`,
    `Il killer è ${ctx.killerKey} (scelto a caso dal sistema: rispettalo).`,
    ctx.notes ? `Note dell'host: ${ctx.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function retryBlock(errors: string[] | undefined): string {
  if (!errors?.length) return "";
  return `\n\nIl tentativo precedente aveva questi problemi, correggili tutti:\n- ${errors.join("\n- ")}`;
}

export function plotPrompt(ctx: GenerationContext, errors?: string[]): string {
  const clues = ctx.difficulty === "easy" ? "3-4" : "4-6";
  return `${header(ctx)}

STEP 1 — TRAMA. Crea il mistero:
- vittima, delitto (metodo, luogo, ora, vero movente del killer) e una timeline della serata;
- ${ctx.playerCount} personaggi con nome, ruolo, descrizione pubblica, look/costume, rapporto con la vittima, segreto, alibi (vero o falso), movente apparente;
- almeno ${ctx.playerCount} relazioni tra personaggi (rivalità, amori, debiti, ricatti);
- ${clues} indizi chiave (id K1, K2…) che insieme portano al killer, ognuno assegnato a un personaggio innocente diverso (holderKey) e a un atto (1-${ctx.acts}); dosali tra gli atti;
- ${ctx.redHerrings} depistaggi (id R1…) che puntano a innocenti;
- ${ctx.acts} atti con titolo e colpo di scena;
- la soluzione completa che collega tutti gli indizi chiave.${retryBlock(errors)}`;
}

export function detailsPrompt(ctx: GenerationContext, plot: Plot, errors?: string[]): string {
  const sq =
    ctx.sideQuestsPer === 0
      ? "Nessuna side quest: sideQuests deve essere un array vuoto per tutti."
      : `Esattamente ${ctx.sideQuestsPer} side quest per personaggio: missioni sociali divertenti da compiere durante la cena, ognuna con un bersaglio (targetKey) diverso da sé e verificabile dal bersaglio stesso (targetPrompt è la domanda sì/no che il bersaglio riceverà).`;
  return `${header(ctx)}

Trama già decisa (JSON):
${JSON.stringify(plot)}

STEP 2 — PERSONAGGI. Per ogni personaggio scrivi:
- backstory in seconda persona (5-8 frasi), coerente con trama e relazioni;
- 2-3 obiettivi concreti per la serata;
- cosa sa degli altri personaggi (knowledge), in modo che debba parlare con almeno due persone;
- killerGuidance solo per il killer ${plot.killerKey}: come sostenere l'alibi falso, chi incolpare, cosa evitare. Stringa vuota per gli altri;
- exonerationReveal per gli innocenti: il segreto che verrà rivelato a tutti se arrestato per errore. Stringa vuota per il killer.
${sq}${retryBlock(errors)}`;
}

export function scriptPrompt(ctx: GenerationContext, plot: Plot, details: Details, errors?: string[]): string {
  return `${header(ctx)}

Trama (JSON):
${JSON.stringify(plot)}

Personaggi (JSON):
${JSON.stringify(details)}

STEP 3 — COPIONE. Scrivi:
- prologueNarration: apertura da leggere ad alta voce (scoperta del delitto, nessuno può andarsene);
- per ognuno dei ${ctx.acts} atti: narration (include il colpo di scena dell'atto) e i messaggi privati;
  * ogni personaggio riceve almeno 2 messaggi per atto (moment start/middle/late), brevi e azionabili: con chi parlare ({{Ck}}), cosa chiedere, cosa nascondere;
  * consegna ogni indizio chiave al suo holderKey nell'atto indicato, con kind "clue" e clueId uguale all'id (K1…);
  * consegna i depistaggi come kind "clue" con clueId vuoto;
  * il killer ${plot.killerKey} riceve in ogni atto almeno un messaggio kind "killer_tip" per depistare;
  * puoi aggiungere eventi per tutti (toKey "ALL", kind "event") che movimentano la serata;
- showdownNarration: se il killer viene arrestato prima della fine;
- epilogueNarration: la rivelazione finale completa, che spiega come gli indizi portavano al killer.${retryBlock(errors)}`;
}
