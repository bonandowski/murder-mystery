import {
  computeClock,
  isVotePhase,
  nextPhaseIdx,
  POINTS,
  resolveVote,
  shouldAutoAdvance,
  shouldCloseVote,
  voteScoreEvents,
  type ScoreEvent,
} from "@/lib/game/engine";
import { loadGame, loadPhases, loadPlayers, updateGameIfVersion } from "./game";
import { HttpError } from "./http";
import { notifyGame } from "./notify";
import type {
  CharacterRow,
  GameRow,
  PhaseRow,
  PlayerRow,
  SideQuestRow,
  SolutionRow,
  VoteRoundRow,
  VoteRow,
} from "./rows";
import { db, must } from "./supabase";

const nowIso = () => new Date().toISOString();

function clockOf(game: GameRow, phase: PhaseRow, nowMs: number) {
  return computeClock(
    {
      phaseStartedAt: game.phase_started_at,
      pausedAt: game.paused_at,
      pausedTotalSeconds: game.paused_total_seconds,
      phaseExtraSeconds: game.phase_extra_seconds,
      targetSeconds: phase.target_seconds,
    },
    nowMs,
  );
}

async function loadCharacters(gameId: string): Promise<CharacterRow[]> {
  return must(await db().from("characters").select("*").eq("game_id", gameId), "characters") as CharacterRow[];
}

async function openSideQuestCount(gameId: string): Promise<number> {
  const rows = must(
    await db().from("side_quests").select("id,status").eq("game_id", gameId),
    "side_quests",
  ) as Pick<SideQuestRow, "id" | "status">[];
  return rows.filter((r) => r.status !== "confirmed").length;
}

async function insertScores(gameId: string, events: ScoreEvent[]): Promise<void> {
  if (!events.length) return;
  must(
    await db()
      .from("score_events")
      .upsert(
        events.map((e) => ({ game_id: gameId, player_id: e.playerId, points: e.points, reason: e.reason, dedupe_key: e.dedupeKey })),
        { onConflict: "game_id,dedupe_key", ignoreDuplicates: true },
      ),
    "scores",
  );
}

async function postMessage(game: GameRow, msg: {
  recipientCharacterId: string | null;
  kind: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  must(
    await db().from("messages").insert({
      game_id: game.id,
      phase_idx: game.current_phase_idx,
      offset_seconds: 0,
      recipient_character_id: msg.recipientCharacterId,
      kind: msg.kind,
      title: msg.title,
      body: msg.body,
      payload: msg.payload ?? {},
      released_at: nowIso(),
    }),
    "message",
  );
}

// ---------------------------------------------------------------------------
// Rilascio messaggi programmati
// ---------------------------------------------------------------------------

/** Rilascia i messaggi della fase corrente il cui orario è passato. Idempotente. */
export async function releaseDue(game: GameRow, phases: PhaseRow[], nowMs = Date.now()): Promise<number> {
  if (game.status !== "in_progress" && game.status !== "ended") return 0;
  const phase = phases.find((p) => p.idx === game.current_phase_idx);
  if (!phase || !game.phase_started_at || game.paused_at) return 0;
  const { elapsed } = clockOf(game, phase, nowMs);
  const rows = must(
    await db()
      .from("messages")
      .update({ released_at: new Date(nowMs).toISOString() })
      .eq("game_id", game.id)
      .eq("phase_idx", phase.idx)
      .is("released_at", null)
      .lte("offset_seconds", Math.floor(elapsed))
      .select("id"),
    "release",
  ) as { id: string }[];
  return rows.length;
}

// ---------------------------------------------------------------------------
// Avvio e avanzamento
// ---------------------------------------------------------------------------

export async function startEvening(game: GameRow): Promise<void> {
  if (game.status !== "ready") throw new HttpError(409, "La storia non è pronta.");
  const updated = await updateGameIfVersion(game, {
    status: "in_progress",
    current_phase_idx: 0,
    phase_started_at: nowIso(),
    paused_at: null,
    paused_total_seconds: 0,
    phase_extra_seconds: 0,
  });
  if (!updated) throw new HttpError(409, "Stato cambiato, riprova.");
  await releaseDue(updated, await loadPhases(game.id));
  await notifyGame(game.id);
}

/**
 * Passa alla fase successiva. In una fase di voto ancora aperta, prima chiude il voto
 * (l'esito resta a schermo finché l'host non preme di nuovo "Continua").
 */
export async function advancePhase(game: GameRow, opts: { forceEnd?: boolean } = {}): Promise<GameRow | null> {
  if (game.status !== "in_progress") throw new HttpError(409, "La partita non è in corso.");
  const phases = await loadPhases(game.id);
  const current = phases.find((p) => p.idx === game.current_phase_idx);
  if (!current) throw new HttpError(409, "Fase corrente sconosciuta.");

  if (isVotePhase(current.kind) && !opts.forceEnd) {
    const round = await loadRound(game.id, current.idx);
    if (round && round.status === "open") {
      await closeVote(game, round);
      return loadGame(game.id);
    }
  }

  const killerArrested = game.killer_arrested;
  const next = nextPhaseIdx(phases, current.idx, {
    killerArrested,
    openSideQuests: killerArrested ? await openSideQuestCount(game.id) : 0,
    forceEnd: opts.forceEnd,
  });
  if (next === null) return null;
  const nextPhase = phases.find((p) => p.idx === next)!;
  const entersEpilogue = nextPhase.kind === "epilogue";

  const updated = await updateGameIfVersion(game, {
    current_phase_idx: next,
    phase_started_at: nowIso(),
    paused_at: null,
    paused_total_seconds: 0,
    phase_extra_seconds: 0,
    ...(entersEpilogue
      ? {
          status: "ended" as const,
          ending_reason: killerArrested ? "killer_caught" : opts.forceEnd ? "host_ended" : "killer_escaped",
        }
      : {}),
  });
  if (!updated) return null;

  // Gli indizi non ancora consegnati della fase appena chiusa non vanno persi.
  await db()
    .from("messages")
    .update({ released_at: nowIso() })
    .eq("game_id", game.id)
    .eq("phase_idx", current.idx)
    .eq("kind", "clue")
    .is("released_at", null);

  if (isVotePhase(nextPhase.kind)) {
    const prev = must(
      await db().from("vote_rounds").select("id").eq("game_id", game.id),
      "rounds",
    ) as { id: string }[];
    await db()
      .from("vote_rounds")
      .upsert(
        { game_id: game.id, phase_idx: next, round_number: prev.length + 1, kind: nextPhase.kind },
        { onConflict: "game_id,phase_idx", ignoreDuplicates: true },
      );
  }

  if (entersEpilogue && !killerArrested) {
    const solution = await loadSolution(game.id);
    const killer = (await loadCharacters(game.id)).find((c) => c.id === solution.killer_character_id);
    if (killer?.player_id) {
      await insertScores(game.id, [
        { playerId: killer.player_id, points: POINTS.killerNeverCaught, reason: "Il killer l'ha fatta franca", dedupeKey: "never-caught" },
      ]);
    }
  }

  await releaseDue(updated, phases);
  await notifyGame(game.id);
  return updated;
}

export type ControlAction = "next" | "extend" | "pause" | "resume" | "close_vote" | "end";

export async function hostControl(game: GameRow, action: ControlAction, expectedVersion: number): Promise<void> {
  if (game.version !== expectedVersion) throw new HttpError(409, "Lo stato è cambiato nel frattempo: riprova.");
  if (game.status !== "in_progress") throw new HttpError(409, "La partita non è in corso.");
  const now = Date.now();
  let ok = true;
  switch (action) {
    case "next":
      ok = (await advancePhase(game)) !== null;
      break;
    case "end":
      ok = (await advancePhase(game, { forceEnd: true })) !== null;
      break;
    case "extend":
      ok = (await updateGameIfVersion(game, { phase_extra_seconds: game.phase_extra_seconds + 300 })) !== null;
      break;
    case "pause":
      if (game.paused_at) return;
      ok = (await updateGameIfVersion(game, { paused_at: new Date(now).toISOString() })) !== null;
      break;
    case "resume": {
      if (!game.paused_at) return;
      const pausedFor = Math.round((now - Date.parse(game.paused_at)) / 1000);
      const updated = await updateGameIfVersion(game, {
        paused_at: null,
        paused_total_seconds: game.paused_total_seconds + pausedFor,
      });
      ok = updated !== null;
      if (updated) await releaseDue(updated, await loadPhases(game.id));
      break;
    }
    case "close_vote": {
      const round = game.current_phase_idx !== null ? await loadRound(game.id, game.current_phase_idx) : null;
      if (!round || round.status !== "open") throw new HttpError(409, "Nessuna votazione aperta.");
      await closeVote(game, round);
      break;
    }
  }
  if (!ok) throw new HttpError(409, "Lo stato è cambiato nel frattempo: riprova.");
  await notifyGame(game.id);
}

// ---------------------------------------------------------------------------
// Votazioni
// ---------------------------------------------------------------------------

async function loadRound(gameId: string, phaseIdx: number): Promise<VoteRoundRow | null> {
  const { data, error } = await db()
    .from("vote_rounds")
    .select("*")
    .eq("game_id", gameId)
    .eq("phase_idx", phaseIdx)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as VoteRoundRow | null) ?? null;
}

async function loadSolution(gameId: string): Promise<SolutionRow> {
  return must(
    await db().from("game_solutions").select("*").eq("game_id", gameId).single(),
    "solution",
  ) as SolutionRow;
}

/** Chiude il voto (una sola volta, anche con più richieste concorrenti) e ne applica l'esito. */
export async function closeVote(game: GameRow, round: VoteRoundRow): Promise<void> {
  const claimed = must(
    await db()
      .from("vote_rounds")
      .update({ status: "closed", closed_at: nowIso() })
      .eq("id", round.id)
      .eq("status", "open")
      .select("*"),
    "close vote",
  ) as VoteRoundRow[];
  if (!claimed.length) return; // qualcun altro l'ha già chiuso

  const [votes, solution, characters] = await Promise.all([
    db().from("votes").select("*").eq("round_id", round.id),
    loadSolution(game.id),
    loadCharacters(game.id),
  ]);
  const voteRows = must(votes, "votes") as VoteRow[];
  const cast = voteRows.map((v) => ({ voterPlayerId: v.voter_player_id, accusedCharacterId: v.accused_character_id }));
  const result = resolveVote(cast, solution.killer_character_id);
  must(
    await db()
      .from("vote_rounds")
      .update({ result_kind: result.kind, result_character_id: result.characterId, tally: result.tally })
      .eq("id", round.id),
    "vote result",
  );

  const killer = characters.find((c) => c.id === solution.killer_character_id);
  await insertScores(
    game.id,
    voteScoreEvents({
      roundId: round.id,
      roundNumber: round.round_number,
      kind: round.kind,
      votes: cast,
      result,
      killerCharacterId: solution.killer_character_id,
      killerPlayerId: killer?.player_id ?? null,
    }),
  );

  const accused = characters.find((c) => c.id === result.characterId);
  if (result.kind === "killer" && accused) {
    await db().from("characters").update({ arrest_status: "killer" }).eq("id", accused.id);
    for (let i = 0; i < 3; i++) {
      const fresh = await loadGame(game.id);
      if (fresh.killer_arrested || (await updateGameIfVersion(fresh, { killer_arrested: true }))) break;
    }
    await postMessage(game, {
      recipientCharacterId: null,
      kind: "reveal",
      title: "Arresto!",
      body: `{{${accused.key}}} finisce in manette… ed era davvero il colpevole!`,
      payload: { result: "killer", characterId: accused.id },
    });
  } else if (result.kind === "innocent" && accused) {
    await db().from("characters").update({ arrest_status: "exonerated" }).eq("id", accused.id);
    const { data: secret } = await db()
      .from("character_secrets")
      .select("exoneration_reveal")
      .eq("character_id", accused.id)
      .maybeSingle();
    const reveal = (secret as { exoneration_reveal: string } | null)?.exoneration_reveal;
    await postMessage(game, {
      recipientCharacterId: null,
      kind: "reveal",
      title: "Arresto sbagliato!",
      body: `{{${accused.key}}} è innocente e viene rilasciato/a. ${reveal ? `Ma ora tutti sanno questo: ${reveal}` : ""}`.trim(),
      payload: { result: "innocent", characterId: accused.id },
    });
  } else {
    await postMessage(game, {
      recipientCharacterId: null,
      kind: "reveal",
      title: result.kind === "tie" ? "Parità" : "Nessun voto",
      body:
        result.kind === "tie"
          ? "I voti sono in parità: nessuno viene arrestato. Il colpevole è ancora tra voi…"
          : "Nessuno ha votato: nessun arresto.",
      payload: { result: result.kind },
    });
  }
  await notifyGame(game.id);
}

export async function castVote(game: GameRow, player: PlayerRow, characterId: string): Promise<void> {
  if (game.status !== "in_progress" || game.current_phase_idx === null) throw new HttpError(409, "Non si vota adesso.");
  const round = await loadRound(game.id, game.current_phase_idx);
  if (!round || round.status !== "open") throw new HttpError(409, "La votazione è chiusa.");
  if (player.is_spectator) throw new HttpError(403, "Gli spettatori non votano.");
  const characters = await loadCharacters(game.id);
  const mine = characters.find((c) => c.player_id === player.id);
  if (!mine) throw new HttpError(403, "Non hai un personaggio.");
  const accused = characters.find((c) => c.id === characterId);
  if (!accused || accused.id === mine.id || accused.arrest_status !== null) {
    throw new HttpError(400, "Non puoi accusare questo personaggio.");
  }
  must(
    await db()
      .from("votes")
      .upsert(
        { round_id: round.id, game_id: game.id, voter_player_id: player.id, accused_character_id: accused.id, created_at: nowIso() },
        { onConflict: "round_id,voter_player_id" },
      ),
    "vote",
  );
  const { count } = await db().from("votes").select("round_id", { count: "exact", head: true }).eq("round_id", round.id);
  const eligible = characters.filter((c) => c.player_id !== null).length;
  if ((count ?? 0) >= eligible) await closeVote(game, round);
  await notifyGame(game.id);
}

// ---------------------------------------------------------------------------
// Side quest
// ---------------------------------------------------------------------------

export async function sideQuestAction(
  game: GameRow,
  player: PlayerRow,
  sideQuestId: string,
  action: "claim" | "confirm" | "reject",
): Promise<void> {
  if (game.status !== "in_progress") throw new HttpError(409, "La partita non è in corso.");
  const { data, error } = await db().from("side_quests").select("*").eq("id", sideQuestId).eq("game_id", game.id).maybeSingle();
  if (error) throw new Error(error.message);
  const sq = data as SideQuestRow | null;
  if (!sq) throw new HttpError(404, "Missione non trovata.");
  const characters = await loadCharacters(game.id);
  const mine = characters.find((c) => c.player_id === player.id);
  if (!mine) throw new HttpError(403, "Non hai un personaggio.");
  const owner = characters.find((c) => c.id === sq.owner_character_id)!;
  const target = characters.find((c) => c.id === sq.target_character_id)!;

  if (action === "claim") {
    if (sq.owner_character_id !== mine.id) throw new HttpError(403, "Non è una tua missione.");
    if (sq.status !== "open" && sq.status !== "rejected") throw new HttpError(409, "Missione già segnalata.");
    const updated = must(
      await db()
        .from("side_quests")
        .update({ status: "claimed", claimed_at: nowIso() })
        .eq("id", sq.id)
        .in("status", ["open", "rejected"])
        .select("id"),
      "claim",
    ) as { id: string }[];
    if (!updated.length) return;
    await postMessage(game, {
      recipientCharacterId: target.id,
      kind: "sq_confirm_request",
      title: "Conferma richiesta",
      body: sq.target_prompt,
      payload: { sideQuestId: sq.id, ownerCharacterId: owner.id },
    });
  } else {
    if (sq.target_character_id !== mine.id) throw new HttpError(403, "Non sei il bersaglio di questa missione.");
    if (sq.status !== "claimed") throw new HttpError(409, "Niente da confermare.");
    const confirmed = action === "confirm";
    const updated = must(
      await db()
        .from("side_quests")
        .update({ status: confirmed ? "confirmed" : "rejected", resolved_at: nowIso() })
        .eq("id", sq.id)
        .eq("status", "claimed")
        .select("id"),
      "resolve",
    ) as { id: string }[];
    if (!updated.length) return;
    if (confirmed && owner.player_id) {
      await insertScores(game.id, [
        { playerId: owner.player_id, points: sq.points, reason: "Missione segreta completata", dedupeKey: `sq:${sq.id}` },
      ]);
    }
    await postMessage(game, {
      recipientCharacterId: owner.id,
      kind: "sq_result",
      title: confirmed ? "Missione compiuta!" : "Missione smentita",
      body: confirmed
        ? `{{${target.key}}} ha confermato: "${sq.description}" (+${sq.points} punti)`
        : `{{${target.key}}} dice che non è andata così. Puoi riprovarci.`,
      payload: { sideQuestId: sq.id },
    });
    // Resa dei conti: quando tutte le missioni sono chiuse si passa all'epilogo.
    if (confirmed && game.killer_arrested) {
      const fresh = await loadGame(game.id);
      const phases = await loadPhases(game.id);
      const current = phases.find((p) => p.idx === fresh.current_phase_idx);
      if (current?.kind === "showdown" && (await openSideQuestCount(game.id)) === 0) {
        await advancePhase(fresh);
      }
    }
  }
  await notifyGame(game.id);
}

// ---------------------------------------------------------------------------
// Tick: heartbeat + manutenzione idempotente, chiamabile da qualunque client
// ---------------------------------------------------------------------------

export async function tick(
  game: GameRow,
  player: PlayerRow,
  readUpTo?: string | null,
): Promise<{ game: GameRow; player: PlayerRow }> {
  const now = Date.now();
  const patch: Partial<PlayerRow> = { last_seen_at: new Date(now).toISOString() };
  if (readUpTo && (!player.inbox_read_at || Date.parse(readUpTo) > Date.parse(player.inbox_read_at))) {
    patch.inbox_read_at = new Date(Math.min(Date.parse(readUpTo), now)).toISOString();
  }
  await db().from("players").update(patch).eq("id", player.id);
  const me = { ...player, ...patch };

  if (game.status !== "in_progress") return { game, player: me };

  const phases = await loadPhases(game.id);
  const phase = phases.find((p) => p.idx === game.current_phase_idx);
  if (!phase) return { game, player: me };
  let changed = (await releaseDue(game, phases, now)) > 0;
  const clock = clockOf(game, phase, now);

  let voteClosedAt: string | null = null;
  if (isVotePhase(phase.kind)) {
    let round = await loadRound(game.id, phase.idx);
    if (round?.status === "open") {
      const [{ count }, characters] = await Promise.all([
        db().from("votes").select("round_id", { count: "exact", head: true }).eq("round_id", round.id),
        loadCharacters(game.id),
      ]);
      const eligible = characters.filter((c) => c.player_id !== null).length;
      if (shouldCloseVote({ votedCount: count ?? 0, eligibleCount: eligible, clock })) {
        await closeVote(game, round);
        changed = true;
        round = await loadRound(game.id, phase.idx);
      }
    }
    voteClosedAt = round?.closed_at ?? null;
  }

  const players = await loadPlayers(game.id);
  const host = players.find((p) => p.is_host);
  const hostLastSeen = host?.id === player.id ? new Date(now).toISOString() : (host?.last_seen_at ?? null);
  if (shouldAutoAdvance({ kind: phase.kind, clock, hostLastSeenAt: hostLastSeen, voteClosedAt, nowMs: now })) {
    const fresh = await loadGame(game.id);
    if (fresh.current_phase_idx === game.current_phase_idx) {
      await advancePhase(fresh);
      changed = true;
    }
  }
  if (changed) await notifyGame(game.id);
  return { game: changed ? await loadGame(game.id) : game, player: me };
}
