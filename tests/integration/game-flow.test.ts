import { describe, expect, it } from "vitest";
import {
  admin,
  call,
  charOf,
  control,
  generate,
  killerSeat,
  rewind,
  setupGame,
  state,
  tick,
} from "./helpers";

const NAMES = ["Leo", "Giulia", "Marco", "Sara", "Paolo"];

describe("lobby", () => {
  it("crea, entra con codice, rifiuta nomi doppi e permessi sbagliati", async () => {
    const { gameId, code, seats } = await setupGame(NAMES.slice(0, 4));
    const dup = await call("/api/games/join", { body: { code: code.toLowerCase(), nickname: "giulia" } });
    expect(dup.status).toBe(409);
    const notHost = await call(`/api/games/${gameId}/settings`, {
      token: seats[1].token,
      body: { settingPreset: "cruise", customSetting: "", tone: "noir", durationMin: 90, difficulty: "hard", notes: "" },
    });
    expect(notHost.status).toBe(403);
    const noAuth = await call(`/api/games/${gameId}/state`);
    expect(noAuth.status).toBe(401);
    const v = await state(gameId, seats[2].token);
    expect(v.players.map((p) => p.nickname)).toEqual(NAMES.slice(0, 4));
    expect(v.characters).toEqual([]);
    expect(v.me.isHost).toBe(false);
  });

  it("serve almeno 4 giocatori per generare", async () => {
    const { gameId, seats } = await setupGame(NAMES.slice(0, 3));
    const r = await call(`/api/games/${gameId}/generate`, { token: seats[0].token, body: { step: 1, restart: true } });
    expect(r.status).toBe(400);
  });
});

describe("partita completa", () => {
  it("genera, distribuisce i segreti senza fughe e gioca fino all'epilogo", async () => {
    const { gameId, code, seats } = await setupGame(NAMES);
    const host = seats[0];
    const tv = await call<{ token: string }>("/api/games/join", { body: { code, nickname: "TV", spectator: true } });
    expect(tv.status).toBe(200);

    await generate(gameId, host.token);
    let v = await state(gameId, seats[1].token);
    expect(v.game.status).toBe("ready");
    expect(v.characters).toHaveLength(5);
    expect(v.scenario?.title).toBeTruthy();
    expect(v.mySecret).toBeNull(); // pre-serata: segreti chiusi

    const late = await call("/api/games/join", { body: { code, nickname: "Ritardatario" } });
    expect(late.status).toBe(409);

    expect((await call(`/api/games/${gameId}/start`, { token: seats[1].token, body: {} })).status).toBe(403);
    expect((await call(`/api/games/${gameId}/start`, { token: host.token, body: {} })).status).toBe(200);

    // Segretezza: ognuno vede solo il proprio segreto, la soluzione non esce.
    const { data: secrets } = await admin().from("character_secrets").select("character_id,secret,backstory").eq("game_id", gameId);
    const killers: string[] = [];
    for (const seat of seats) {
      const view = await state(gameId, seat.token);
      const json = JSON.stringify(view);
      const mine = charOf(view, seat.playerId);
      expect(view.mySecret).not.toBeNull();
      if (view.mySecret!.isKiller) killers.push(seat.nickname);
      for (const s of secrets as { character_id: string; backstory: string }[]) {
        if (s.character_id !== mine) expect(json).not.toContain(s.backstory);
      }
      expect(view.solution).toBeNull();
      expect(view.scores).toBeNull();
    }
    expect(killers).toHaveLength(1);

    const tvView = await state(gameId, tv.data.token);
    expect(tvView.mySecret).toBeNull();
    expect(tvView.messages.every((m) => !m.private)).toBe(true);
    expect(tvView.messages.some((m) => m.kind === "narration")).toBe(true);

    // Messaggi programmati: dopo 70s arriva "Il tuo primo obiettivo" (privato).
    v = await tick(gameId, seats[2].token);
    expect(v.messages.filter((m) => m.private)).toHaveLength(0);
    await rewind(gameId, 70);
    v = await tick(gameId, seats[2].token);
    expect(v.messages.some((m) => m.private && m.title === "Il tuo primo obiettivo")).toBe(true);
    expect(v.nextReleaseAt).toBeNull();

    // Lettura: dopo il markRead non ci sono più non letti.
    const lastAt = v.messages[v.messages.length - 1].releasedAt;
    v = await tick(gameId, seats[2].token, lastAt);
    expect(Date.parse(v.me.inboxReadAt!)).toBeGreaterThanOrEqual(Date.parse(lastAt) - 1);

    // Pausa, ripresa, +5 minuti e versione stantia.
    expect((await control(gameId, host.token, "pause")).status).toBe(200);
    v = await state(gameId, host.token);
    expect(v.game.pausedAt).not.toBeNull();
    const stale = await call(`/api/games/${gameId}/control`, { token: host.token, body: { action: "resume", version: v.game.version - 1 } });
    expect(stale.status).toBe(409);
    expect((await control(gameId, host.token, "resume")).status).toBe(200);
    expect((await control(gameId, host.token, "extend")).status).toBe(200);
    v = await state(gameId, host.token);
    expect(v.game.pausedAt).toBeNull();
    expect(v.game.phaseExtraSeconds).toBe(300);

    // Prologo → Atto I → Votazione I
    expect((await control(gameId, host.token, "next")).status).toBe(200);
    v = await state(gameId, host.token);
    expect(v.phases[v.game.currentPhaseIdx!].kind).toBe("act");
    expect(v.messages.some((m) => m.kind === "narration" && m.phaseIdx === v.game.currentPhaseIdx)).toBe(true);
    await rewind(gameId, 30 * 60);
    v = await tick(gameId, seats[1].token);
    const actMessages = v.messages.filter((m) => m.phaseIdx === v.game.currentPhaseIdx && m.private);
    expect(actMessages.length).toBeGreaterThan(0);

    expect((await control(gameId, host.token, "next")).status).toBe(200);
    v = await state(gameId, host.token);
    expect(v.vote?.status).toBe("open");
    expect(v.vote?.roundNumber).toBe(1);

    // Votazione: tutti accusano lo stesso innocente → scagionato, il gioco continua.
    const killer = await killerSeat(gameId, seats);
    const killerChar = charOf(v, killer.playerId);
    const innocentSeat = seats.find((s) => s !== killer)!;
    const innocentChar = charOf(v, innocentSeat.playerId);
    const selfVote = await call(`/api/games/${gameId}/vote`, { token: innocentSeat.token, body: { characterId: innocentChar } });
    expect(selfVote.status).toBe(400);
    for (const seat of seats) {
      const target = seat === innocentSeat ? killerChar : innocentChar;
      const r = await call(`/api/games/${gameId}/vote`, { token: seat.token, body: { characterId: target } });
      expect(r.status).toBe(200);
    }
    v = await state(gameId, host.token);
    expect(v.vote?.status).toBe("closed");
    expect(v.vote?.result).toMatchObject({ kind: "innocent", characterId: innocentChar });
    expect(v.characters.find((c) => c.id === innocentChar)?.arrestStatus).toBe("exonerated");
    expect(v.messages.some((m) => m.kind === "reveal" && m.title === "Arresto sbagliato!")).toBe(true);
    expect(v.game.killerArrested).toBe(false);

    // Votazione → Atto II
    expect((await control(gameId, host.token, "next")).status).toBe(200);
    v = await state(gameId, host.token);
    expect(v.phases[v.game.currentPhaseIdx!].kind).toBe("act");

    // Side quest: il proprietario segnala, il bersaglio conferma.
    const owner = seats[1];
    const ownerView = await state(gameId, owner.token);
    expect(ownerView.sideQuests).toHaveLength(1);
    const sq = ownerView.sideQuests[0];
    expect((await call(`/api/games/${gameId}/sidequests`, { token: owner.token, body: { sideQuestId: sq.id, action: "claim" } })).status).toBe(200);
    const targetSeat = seats.find((s) => charOf(ownerView, s.playerId) === sq.targetCharacterId)!;
    const targetView = await state(gameId, targetSeat.token);
    expect(targetView.pendingConfirmations.map((p) => p.sideQuestId)).toContain(sq.id);
    expect(targetView.messages.some((m) => m.kind === "sq_confirm_request")).toBe(true);
    const wrong = await call(`/api/games/${gameId}/sidequests`, { token: owner.token, body: { sideQuestId: sq.id, action: "confirm" } });
    expect(wrong.status).toBe(403);
    expect((await call(`/api/games/${gameId}/sidequests`, { token: targetSeat.token, body: { sideQuestId: sq.id, action: "confirm" } })).status).toBe(200);
    expect((await state(gameId, owner.token)).sideQuests[0].status).toBe("confirmed");

    // Atto II → Accusa finale: l'innocente scagionato non è più accusabile.
    expect((await control(gameId, host.token, "next")).status).toBe(200);
    v = await state(gameId, host.token);
    expect(v.vote?.kind).toBe("final_vote");
    expect(v.vote?.accusableIds).not.toContain(innocentChar);
    for (const seat of seats) {
      const target = seat === killer ? seats.find((s) => s !== killer && s !== innocentSeat)! : killer;
      await call(`/api/games/${gameId}/vote`, { token: seat.token, body: { characterId: charOf(v, target.playerId) } });
    }
    v = await state(gameId, host.token);
    expect(v.vote?.result?.kind).toBe("killer");

    // Accusa finale → Epilogo (anche con missioni aperte non c'è resa dei conti).
    expect((await control(gameId, host.token, "next")).status).toBe(200);
    v = await state(gameId, seats[3].token);
    expect(v.game.status).toBe("ended");
    expect(v.game.endingReason).toBe("killer_caught");
    expect(v.solution?.killerCharacterId).toBe(killerChar);
    expect(v.scores).toHaveLength(5);
    const ownerScore = v.scores!.find((s) => s.playerId === owner.playerId)!;
    expect(ownerScore.reasons.some((r) => r.reason === "Missione segreta completata")).toBe(true);
    const killerScore = v.scores!.find((s) => s.playerId === killer.playerId)!;
    expect(killerScore.points).toBeGreaterThanOrEqual(4); // sfuggito + innocente arrestato
    expect(v.messages.some((m) => m.kind === "narration" && m.title === "La verità")).toBe(true);
  });

  it("killer preso subito con missioni aperte: resa dei conti, poi epilogo quando le missioni sono chiuse", async () => {
    const { gameId, seats } = await setupGame(NAMES.slice(0, 4));
    const host = seats[0];
    await generate(gameId, host.token);
    await call(`/api/games/${gameId}/start`, { token: host.token, body: {} });
    await control(gameId, host.token, "next"); // atto I
    await control(gameId, host.token, "next"); // votazione I
    let v = await state(gameId, host.token);
    const killer = await killerSeat(gameId, seats);
    const killerChar = charOf(v, killer.playerId);
    const other = seats.find((s) => s !== killer)!;
    for (const seat of seats) {
      await call(`/api/games/${gameId}/vote`, {
        token: seat.token,
        body: { characterId: seat === killer ? charOf(v, other.playerId) : killerChar },
      });
    }
    v = await state(gameId, host.token);
    expect(v.vote?.result?.kind).toBe("killer");
    expect(v.game.killerArrested).toBe(true);
    await control(gameId, host.token, "next");
    v = await state(gameId, host.token);
    expect(v.phases[v.game.currentPhaseIdx!].kind).toBe("showdown");

    // Completa tutte le missioni: alla fine si passa da soli all'epilogo.
    const { data: quests } = await admin().from("side_quests").select("id,owner_character_id,target_character_id").eq("game_id", gameId);
    const seatByChar = new Map(seats.map((s) => [charOf(v, s.playerId), s]));
    for (const q of quests as { id: string; owner_character_id: string; target_character_id: string }[]) {
      await call(`/api/games/${gameId}/sidequests`, { token: seatByChar.get(q.owner_character_id)!.token, body: { sideQuestId: q.id, action: "claim" } });
      await call(`/api/games/${gameId}/sidequests`, { token: seatByChar.get(q.target_character_id)!.token, body: { sideQuestId: q.id, action: "confirm" } });
    }
    v = await state(gameId, host.token);
    expect(v.game.status).toBe("ended");
    expect(v.phases[v.game.currentPhaseIdx!].kind).toBe("epilogue");
  });

  it("se l'host sparisce, la partita avanza da sola dopo la tolleranza", async () => {
    const { gameId, seats } = await setupGame(NAMES.slice(0, 4), { difficulty: "easy" });
    const host = seats[0];
    await generate(gameId, host.token);
    await call(`/api/games/${gameId}/start`, { token: host.token, body: {} });
    let v = await state(gameId, seats[1].token);
    const prologueSeconds = v.phases[0].targetSeconds;

    await admin().from("players").update({ last_seen_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("id", host.playerId);
    await rewind(gameId, prologueSeconds + 60);
    v = await tick(gameId, seats[1].token);
    expect(v.game.currentPhaseIdx).toBe(0); // tempo scaduto, ma tolleranza non ancora passata

    await rewind(gameId, 200);
    v = await tick(gameId, seats[1].token);
    expect(v.game.currentPhaseIdx).toBe(1);

    // Con l'host online invece si aspetta lui.
    await tick(gameId, host.token);
    await rewind(gameId, 60 * 60);
    v = await tick(gameId, seats[1].token);
    expect(v.game.currentPhaseIdx).toBe(1);
  });

  it("riassegna un giocatore a un nuovo telefono e il link personale funziona", async () => {
    const { gameId, seats } = await setupGame(NAMES.slice(0, 4));
    const r = await call<{ token: string }>(`/api/games/${gameId}/players`, {
      token: seats[0].token,
      body: { action: "reassign", playerId: seats[2].playerId },
    });
    expect(r.status).toBe(200);
    expect((await call(`/api/games/${gameId}/state`, { token: seats[2].token })).status).toBe(401);
    const v = await state(gameId, r.data.token);
    expect(v.me.nickname).toBe(seats[2].nickname);
    const rejoin = await call<{ gameId: string }>("/api/rejoin", { body: { token: r.data.token } });
    expect(rejoin.data.gameId).toBe(gameId);
  });
});

describe("sicurezza del database", () => {
  it("la chiave pubblica non legge nessuna tabella", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
    for (const table of ["games", "players", "character_secrets", "game_solutions", "messages"]) {
      const { data, error } = await anon.from(table).select("*").limit(1);
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });
});
