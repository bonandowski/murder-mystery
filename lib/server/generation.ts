import { randomInt, randomUUID } from "node:crypto";
import { buildStoryRows } from "@/lib/game/build";
import { actsForDuration } from "@/lib/game/phases";
import {
  characterKeys,
  detailsSchema,
  generationContextSchema,
  plotSchema,
  scriptSchema,
  type Details,
  type GenerationContext,
  type Plot,
  type Script,
} from "@/lib/game/schemas";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  parseSettings,
  redHerringCount,
  settingDescription,
  sideQuestsPerCharacter,
  TONES,
} from "@/lib/game/settings";
import { validateDetails, validatePlot, validateScript } from "@/lib/game/validate";
import { getProvider } from "@/lib/llm";
import { detailsPrompt, plotPrompt, scriptPrompt, SYSTEM_PROMPT } from "@/lib/llm/prompts";
import { LLMError } from "@/lib/llm/provider";
import { loadPlayers } from "./game";
import { HttpError } from "./http";
import { notifyGame } from "./notify";
import type { GameRow } from "./rows";
import { db, must } from "./supabase";

export const MAX_GENERATIONS_PER_GAME = 3;
export const MAX_ATTEMPTS_PER_STEP = 3;

interface DraftRow {
  id: string;
  step: number;
  data: unknown;
  errors: string[] | null;
  created_at: string;
}

export type StepResult =
  | { ok: true; step: number; done: boolean }
  | { ok: false; step: number; errors: string[]; retryable: boolean };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function drafts(gameId: string): Promise<DraftRow[]> {
  return must(
    await db().from("generation_drafts").select("*").eq("game_id", gameId).order("created_at", { ascending: true }),
    "drafts",
  ) as DraftRow[];
}

/** Bozze della generazione corrente (dall'ultimo step 0 in poi). */
function currentDrafts(all: DraftRow[]): DraftRow[] {
  let start = -1;
  all.forEach((d, i) => {
    if (d.step === 0) start = i;
  });
  return start >= 0 ? all.slice(start) : [];
}

function latestOk(list: DraftRow[], step: number): DraftRow | undefined {
  return [...list].reverse().find((d) => d.step === step && !d.errors?.length);
}

async function resetStory(gameId: string): Promise<void> {
  const client = db();
  for (const table of ["vote_rounds", "messages", "side_quests", "game_solutions", "phases", "characters", "scenarios", "score_events"]) {
    must(await client.from(table).delete().eq("game_id", gameId), `reset ${table}`);
  }
}

async function beginGeneration(game: GameRow): Promise<void> {
  if (game.generation_count >= MAX_GENERATIONS_PER_GAME) {
    throw new HttpError(429, `Hai già generato ${MAX_GENERATIONS_PER_GAME} storie per questa partita.`);
  }
  const cap = Number(process.env.DAILY_GENERATION_CAP ?? 20);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error } = await db()
    .from("generation_drafts")
    .select("id", { count: "exact", head: true })
    .eq("step", 0)
    .gte("created_at", since);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= cap) throw new HttpError(429, "Limite giornaliero di generazioni raggiunto: riprova domani.");

  const players = (await loadPlayers(game.id)).filter((p) => !p.is_spectator);
  if (players.length < MIN_PLAYERS) throw new HttpError(400, `Servono almeno ${MIN_PLAYERS} giocatori.`);
  if (players.length > MAX_PLAYERS) throw new HttpError(400, `Massimo ${MAX_PLAYERS} giocatori.`);

  const settings = parseSettings(game.settings);
  const order = shuffle(players);
  const keys = characterKeys(order.length);
  const ctx: GenerationContext = {
    playerCount: order.length,
    acts: actsForDuration(settings.durationMin),
    killerKey: keys[randomInt(keys.length)],
    genders: order.map((p) => (p.character_pref === "any" ? "x" : p.character_pref)),
    sideQuestsPer: sideQuestsPerCharacter(settings.difficulty),
    redHerrings: redHerringCount(settings.difficulty),
    settingDescription: settingDescription(settings),
    tone: TONES[settings.tone],
    difficulty: settings.difficulty,
    durationMin: settings.durationMin,
    notes: settings.notes,
    assignment: order.map((p, i) => ({ key: keys[i], playerId: p.id })),
  };

  await resetStory(game.id);
  must(await db().from("generation_drafts").insert({ game_id: game.id, step: 0, data: ctx }), "draft ctx");
  must(
    await db()
      .from("games")
      .update({
        status: "generating",
        generation_step: 0,
        generation_error: null,
        generation_attempts: 0,
        generation_count: game.generation_count + 1,
      })
      .eq("id", game.id),
    "begin generation",
  );
}

/**
 * Esegue UNO step della pipeline (1 trama, 2 personaggi, 3 copione, 4 salvataggio).
 * Ogni step è una richiesta separata: resta sotto i limiti di durata delle
 * funzioni serverless e, se qualcosa si interrompe, si riprende da dove si era.
 */
export async function runGenerationStep(game: GameRow, step: number, restart: boolean): Promise<StepResult> {
  if (step === 1 && (game.status === "lobby" || (restart && (game.status === "ready" || game.status === "generating")))) {
    await beginGeneration(game);
  } else if (game.status !== "generating") {
    throw new HttpError(409, "La generazione non è in corso.");
  }
  if (step < 1 || step > 4) throw new HttpError(400, "Step non valido");

  const list = currentDrafts(await drafts(game.id));
  const ctxDraft = list.find((d) => d.step === 0);
  if (!ctxDraft) throw new HttpError(409, "Generazione non inizializzata: riparti dallo step 1.");
  const ctx = generationContextSchema.parse(ctxDraft.data) as GenerationContext;
  const plot = latestOk(list, 1)?.data as Plot | undefined;
  const details = latestOk(list, 2)?.data as Details | undefined;
  const script = latestOk(list, 3)?.data as Script | undefined;
  const lastErrors = (s: number) => {
    const last = [...list].reverse().find((d) => d.step === s);
    return last?.errors?.length ? last.errors : undefined;
  };

  if (step === 4) {
    if (!plot || !details || !script) throw new HttpError(409, "Mancano degli step precedenti.");
    await persistStory(game, ctx, plot, details, script);
    await notifyGame(game.id);
    return { ok: true, step: 4, done: true };
  }

  if (step >= 2 && !plot) throw new HttpError(409, "Manca la trama: riparti dallo step 1.");
  if (step >= 3 && !details) throw new HttpError(409, "Mancano i personaggi: rifai lo step 2.");

  const provider = getProvider();
  let data: Plot | Details | Script;
  let errors: string[];
  try {
    if (step === 1) {
      data = await provider.generate({
        step: "plot", system: SYSTEM_PROMPT, prompt: plotPrompt(ctx, lastErrors(1)), schema: plotSchema, context: ctx, previous: {},
      });
      errors = validatePlot(data, ctx);
    } else if (step === 2) {
      data = await provider.generate({
        step: "details", system: SYSTEM_PROMPT, prompt: detailsPrompt(ctx, plot!, lastErrors(2)), schema: detailsSchema, context: ctx, previous: { plot },
      });
      errors = validateDetails(data, plot!, ctx);
    } else {
      data = await provider.generate({
        step: "script", system: SYSTEM_PROMPT, prompt: scriptPrompt(ctx, plot!, details!, lastErrors(3)), schema: scriptSchema, context: ctx, previous: { plot, details },
      });
      errors = validateScript(data, plot!, ctx);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore del modello";
    const retryable = err instanceof LLMError ? err.retryable : true;
    await markStepError(game, step, [message]);
    return { ok: false, step, errors: [message], retryable };
  }

  must(
    await db().from("generation_drafts").insert({ game_id: game.id, step, data, errors: errors.length ? errors : null }),
    "draft",
  );
  if (errors.length) {
    await markStepError(game, step, errors);
    return { ok: false, step, errors, retryable: true };
  }
  must(
    await db()
      .from("games")
      .update({ generation_step: step, generation_error: null, generation_attempts: 0 })
      .eq("id", game.id),
    "step ok",
  );
  await notifyGame(game.id);
  return { ok: true, step, done: false };
}

async function markStepError(game: GameRow, step: number, errors: string[]): Promise<void> {
  const { data } = await db().from("games").select("generation_attempts").eq("id", game.id).single();
  const attempts = ((data as { generation_attempts: number } | null)?.generation_attempts ?? 0) + 1;
  await db()
    .from("games")
    .update({
      generation_error: `Step ${step}: ${errors.slice(0, 3).join(" · ")}`.slice(0, 1000),
      generation_attempts: attempts,
    })
    .eq("id", game.id);
  await notifyGame(game.id);
}

async function persistStory(game: GameRow, ctx: GenerationContext, plot: Plot, details: Details, script: Script) {
  const settings = parseSettings(game.settings);
  const rows = buildStoryRows({ ctx, settings, plot, details, script, newId: randomUUID });
  const client = db();
  const gid = game.id;
  await resetStory(gid);
  must(await client.from("scenarios").insert({ game_id: gid, ...rows.scenario }), "scenario");
  must(await client.from("characters").insert(rows.characters.map((c) => ({ game_id: gid, ...c }))), "characters");
  must(await client.from("character_secrets").insert(rows.secrets.map((s) => ({ game_id: gid, ...s }))), "secrets");
  must(await client.from("game_solutions").insert({ game_id: gid, ...rows.solution }), "solution");
  must(await client.from("phases").insert(rows.phases.map((p) => ({ game_id: gid, ...p }))), "phases");
  must(await client.from("messages").insert(rows.messages.map((m) => ({ game_id: gid, ...m }))), "messages");
  if (rows.sideQuests.length) {
    must(await client.from("side_quests").insert(rows.sideQuests.map((s) => ({ game_id: gid, ...s }))), "side_quests");
  }
  must(
    await client
      .from("games")
      .update({ status: "ready", generation_step: 4, generation_error: null })
      .eq("id", gid),
    "ready",
  );
}

/** Annulla la generazione in corso e torna alla lobby (roster di nuovo modificabile). */
export async function cancelGeneration(game: GameRow): Promise<void> {
  if (game.status !== "generating" && game.status !== "ready") throw new HttpError(409, "Niente da annullare.");
  await resetStory(game.id);
  must(
    await db()
      .from("games")
      .update({ status: "lobby", generation_step: 0, generation_error: null, generation_attempts: 0 })
      .eq("id", game.id),
    "cancel",
  );
  await notifyGame(game.id);
}
