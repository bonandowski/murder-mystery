import { z } from "zod";

/**
 * Schemi dell'output LLM, uno per step della pipeline.
 * Niente campi opzionali né union complesse: restano compatibili con lo
 * structured output di Gemini (`responseJsonSchema`) e con altri provider.
 * I personaggi sono identificati da chiavi "C1".."CN"; nei testi si citano
 * con il token {{Ck}}, risolto a schermo in "Nome (nickname)".
 */

const characterKey = z.string().describe('Chiave del personaggio, es. "C3"');

// ---------------------------------------------------------------------------
// Step 1 — Trama
// ---------------------------------------------------------------------------
export const plotSchema = z.object({
  title: z.string().describe("Titolo evocativo del mistero"),
  setting: z.string().describe("Ambientazione dettagliata: luogo, epoca, atmosfera"),
  premise: z.string().describe("Perché tutti i personaggi sono riuniti stasera"),
  dressCode: z.string().describe("Suggerimento di dress code generale per gli invitati"),
  victim: z.object({
    name: z.string(),
    description: z.string().describe("Chi era la vittima e perché in tanti avevano motivo di odiarla"),
  }),
  crime: z.object({
    method: z.string(),
    place: z.string(),
    time: z.string(),
    motive: z.string().describe("Il vero movente del killer"),
  }),
  killerKey: characterKey,
  characters: z.array(
    z.object({
      key: characterKey,
      name: z.string(),
      gender: z.enum(["m", "f", "x"]),
      role: z.string().describe("Ruolo/professione nella storia"),
      publicDescription: z.string().describe("Quello che tutti sanno di questo personaggio"),
      look: z.string().describe("Costume/dress code consigliato per chi lo interpreta"),
      relationToVictim: z.string(),
      secret: z.string().describe("Il segreto che deve nascondere (diverso dall'omicidio per gli innocenti)"),
      alibi: z.string(),
      alibiIsTrue: z.boolean(),
      apparentMotive: z.string().describe("Il movente apparente che lo rende sospettabile"),
    }),
  ),
  relationships: z.array(
    z.object({ a: characterKey, b: characterKey, description: z.string() }),
  ),
  keyClues: z.array(
    z.object({
      id: z.string().describe('Es. "K1"'),
      text: z.string().describe("Indizio che, combinato con gli altri, porta al killer"),
      holderKey: characterKey,
      act: z.number().int(),
    }),
  ),
  redHerrings: z.array(
    z.object({
      id: z.string().describe('Es. "R1"'),
      text: z.string(),
      suspectKey: characterKey,
      holderKey: characterKey,
      act: z.number().int(),
    }),
  ),
  acts: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      twist: z.string().describe("Colpo di scena o rivelazione che apre l'atto"),
    }),
  ),
  timeline: z.array(z.object({ time: z.string(), event: z.string() })),
  solution: z.string().describe("Spiegazione completa della soluzione, che collega tutti gli indizi chiave"),
});
export type Plot = z.infer<typeof plotSchema>;

// ---------------------------------------------------------------------------
// Step 2 — Personaggi
// ---------------------------------------------------------------------------
export const detailsSchema = z.object({
  characters: z.array(
    z.object({
      key: characterKey,
      backstory: z.string().describe("Storia personale in seconda persona (\"Sei…\")"),
      objectives: z.array(z.string()).describe("2-3 obiettivi concreti per la serata"),
      knowledge: z.array(
        z.object({ aboutKey: characterKey, fact: z.string() }),
      ).describe("Cosa sai degli altri personaggi"),
      killerGuidance: z
        .string()
        .describe("Solo per il killer: come mentire e chi incolpare. Stringa vuota per gli altri"),
      exonerationReveal: z
        .string()
        .describe("Segreto rivelato a tutti se viene arrestato da innocente. Stringa vuota per il killer"),
      sideQuests: z.array(
        z.object({
          targetKey: characterKey,
          description: z.string().describe("Missione per il proprietario, in seconda persona"),
          targetPrompt: z
            .string()
            .describe("Domanda di conferma mostrata al bersaglio, es. \"{{C2}} ti ha fatto ammettere che…?\""),
        }),
      ),
    }),
  ),
});
export type Details = z.infer<typeof detailsSchema>;

// ---------------------------------------------------------------------------
// Step 3 — Copione delle fasi
// ---------------------------------------------------------------------------
export const scriptSchema = z.object({
  prologueNarration: z.string().describe("Narrazione d'apertura da leggere ad alta voce"),
  acts: z.array(
    z.object({
      number: z.number().int(),
      narration: z.string().describe("Narrazione d'apertura dell'atto, include il colpo di scena"),
      messages: z.array(
        z.object({
          toKey: z.string().describe('Chiave del destinatario ("C1"…) oppure "ALL" per tutti'),
          moment: z.enum(["start", "middle", "late"]),
          kind: z.enum(["hint", "clue", "event", "killer_tip"]),
          clueId: z.string().describe('Id dell\'indizio chiave consegnato ("K1"…), stringa vuota se nessuno'),
          title: z.string(),
          body: z.string().describe("Testo breve e azionabile: con chi parlare, cosa chiedere o nascondere"),
        }),
      ),
    }),
  ),
  showdownNarration: z.string().describe("Narrazione se il killer viene arrestato prima della fine"),
  epilogueNarration: z.string().describe("Rivelazione finale completa da leggere ad alta voce"),
});
export type Script = z.infer<typeof scriptSchema>;

// ---------------------------------------------------------------------------
// Contesto della generazione (deciso dal codice, non dal modello)
// ---------------------------------------------------------------------------
export interface GenerationContext {
  playerCount: number;
  acts: number;
  killerKey: string;
  genders: ("m" | "f" | "x")[];
  sideQuestsPer: number;
  redHerrings: number;
  settingDescription: string;
  tone: string;
  difficulty: "easy" | "medium" | "hard";
  durationMin: number;
  notes: string;
  /** Assegnazione chiave → giocatore, decisa prima della generazione. */
  assignment: { key: string; playerId: string }[];
}

export const generationContextSchema = z.object({
  playerCount: z.number().int(),
  acts: z.number().int(),
  killerKey: z.string(),
  genders: z.array(z.enum(["m", "f", "x"])),
  sideQuestsPer: z.number().int(),
  redHerrings: z.number().int(),
  settingDescription: z.string(),
  tone: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  durationMin: z.number().int(),
  notes: z.string(),
  assignment: z.array(z.object({ key: z.string(), playerId: z.string() })),
});

export function characterKeys(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `C${i + 1}`);
}
