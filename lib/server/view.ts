import { isOnline, isVotePhase } from "@/lib/game/engine";
import { parseSettings } from "@/lib/game/settings";
import type { PlayerView } from "@/lib/game/view";
import type {
  CharacterRow,
  GameRow,
  MessageRow,
  PhaseRow,
  PlayerRow,
  ScenarioRow,
  ScoreEventRow,
  SecretRow,
  SideQuestRow,
  SolutionRow,
  VoteRoundRow,
  VoteRow,
} from "./rows";
import { db, must } from "./supabase";

const STORY_VISIBLE = new Set(["ready", "in_progress", "ended"]);
const PLAYING = new Set(["in_progress", "ended"]);

/**
 * Costruisce lo stato visibile a un giocatore. È l'UNICO punto in cui i dati
 * escono dal database verso i client: qui si applicano le regole di segretezza.
 */
export async function buildView(game: GameRow, me: PlayerRow, nowMs = Date.now()): Promise<PlayerView> {
  const client = db();
  const storyVisible = STORY_VISIBLE.has(game.status);
  const playing = PLAYING.has(game.status);
  const ended = game.status === "ended";

  const [players, scenario, characters, phases] = await Promise.all([
    client.from("players").select("*").eq("game_id", game.id).order("joined_at"),
    storyVisible ? client.from("scenarios").select("*").eq("game_id", game.id).maybeSingle() : null,
    storyVisible ? client.from("characters").select("*").eq("game_id", game.id).order("sort_order") : null,
    storyVisible ? client.from("phases").select("*").eq("game_id", game.id).order("idx") : null,
  ]);
  const playerRows = must(players, "players") as PlayerRow[];
  const characterRows = (characters ? must(characters, "characters") : []) as CharacterRow[];
  const phaseRows = (phases ? must(phases, "phases") : []) as PhaseRow[];
  const scenarioRow = (scenario ? must(scenario, "scenario") : null) as ScenarioRow | null;

  const myCharacter = characterRows.find((c) => c.player_id === me.id) ?? null;
  const currentPhase = phaseRows.find((p) => p.idx === game.current_phase_idx) ?? null;

  const [secret, messages, sideQuests, round, scores, solution, nextRelease] = await Promise.all([
    playing && myCharacter
      ? client.from("character_secrets").select("*").eq("character_id", myCharacter.id).maybeSingle()
      : null,
    playing
      ? client
          .from("messages")
          .select("*")
          .eq("game_id", game.id)
          .not("released_at", "is", null)
          .order("released_at")
      : null,
    playing ? client.from("side_quests").select("*").eq("game_id", game.id) : null,
    playing && currentPhase && isVotePhase(currentPhase.kind)
      ? client.from("vote_rounds").select("*").eq("game_id", game.id).eq("phase_idx", currentPhase.idx).maybeSingle()
      : null,
    ended ? client.from("score_events").select("*").eq("game_id", game.id) : null,
    ended ? client.from("game_solutions").select("*").eq("game_id", game.id).maybeSingle() : null,
    game.status === "in_progress" && currentPhase && !game.paused_at && game.phase_started_at
      ? client
          .from("messages")
          .select("offset_seconds")
          .eq("game_id", game.id)
          .eq("phase_idx", currentPhase.idx)
          .is("released_at", null)
          .order("offset_seconds")
          .limit(1)
      : null,
  ]);

  const secretRow = (secret ? must(secret, "secret") : null) as SecretRow | null;
  const visibleMessages = ((messages ? must(messages, "messages") : []) as MessageRow[]).filter((m) => {
    if (m.recipient_character_id === null) return true;
    return !me.is_spectator && myCharacter !== null && m.recipient_character_id === myCharacter.id;
  });
  const sqRows = (sideQuests ? must(sideQuests, "side_quests") : []) as SideQuestRow[];
  const roundRow = (round ? must(round, "vote_round") : null) as VoteRoundRow | null;

  let vote: PlayerView["vote"] = null;
  if (roundRow) {
    const voteRows = must(
      await client.from("votes").select("*").eq("round_id", roundRow.id),
      "votes",
    ) as VoteRow[];
    const eligible = playerRows.filter((p) => !p.is_spectator && characterRows.some((c) => c.player_id === p.id));
    const accusable = characterRows.filter((c) => c.arrest_status === null && c.id !== myCharacter?.id).map((c) => c.id);
    vote = {
      roundId: roundRow.id,
      phaseIdx: roundRow.phase_idx,
      roundNumber: roundRow.round_number,
      kind: roundRow.kind,
      status: roundRow.status,
      eligibleCount: eligible.length,
      votedCount: voteRows.length,
      myVoteCharacterId: voteRows.find((v) => v.voter_player_id === me.id)?.accused_character_id ?? null,
      canVote: roundRow.status === "open" && !me.is_spectator && myCharacter !== null,
      accusableIds: accusable,
      closedAt: roundRow.closed_at,
      result:
        roundRow.status === "closed" && roundRow.result_kind
          ? { kind: roundRow.result_kind, characterId: roundRow.result_character_id, tally: roundRow.tally ?? {} }
          : null,
    };
  }

  let scoreBoard: PlayerView["scores"] = null;
  if (scores) {
    const events = must(scores, "scores") as ScoreEventRow[];
    scoreBoard = playerRows
      .filter((p) => !p.is_spectator)
      .map((p) => {
        const mine = events.filter((e) => e.player_id === p.id);
        return {
          playerId: p.id,
          nickname: p.nickname,
          characterId: characterRows.find((c) => c.player_id === p.id)?.id ?? null,
          points: mine.reduce((s, e) => s + e.points, 0),
          reasons: mine.map((e) => ({ reason: e.reason, points: e.points })),
        };
      })
      .sort((a, b) => b.points - a.points);
  }

  const solutionRow = (solution ? must(solution, "solution") : null) as SolutionRow | null;
  const nextRows = (nextRelease ? must(nextRelease, "next_release") : []) as { offset_seconds: number }[];
  const nextReleaseAt =
    nextRows.length && game.phase_started_at
      ? Date.parse(game.phase_started_at) + (game.paused_total_seconds + nextRows[0].offset_seconds) * 1000
      : null;

  return {
    serverNow: nowMs,
    game: {
      id: game.id,
      code: game.code,
      status: game.status,
      settings: parseSettings(game.settings),
      version: game.version,
      currentPhaseIdx: game.current_phase_idx,
      phaseStartedAt: game.phase_started_at,
      pausedAt: game.paused_at,
      pausedTotalSeconds: game.paused_total_seconds,
      phaseExtraSeconds: game.phase_extra_seconds,
      killerArrested: game.killer_arrested,
      endingReason: game.ending_reason,
      generation: { step: game.generation_step, error: game.generation_error, attempts: game.generation_attempts },
    },
    me: {
      id: me.id,
      nickname: me.nickname,
      isHost: me.is_host,
      isSpectator: me.is_spectator,
      characterId: myCharacter?.id ?? null,
      inboxReadAt: me.inbox_read_at,
    },
    players: playerRows.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      characterPref: p.character_pref,
      isHost: p.is_host,
      isSpectator: p.is_spectator,
      online: isOnline(p.last_seen_at, nowMs),
      characterId: characterRows.find((c) => c.player_id === p.id)?.id ?? null,
    })),
    scenario: scenarioRow
      ? {
          title: scenarioRow.title,
          setting: scenarioRow.setting,
          premise: scenarioRow.premise,
          victimName: scenarioRow.victim_name,
          victimDescription: scenarioRow.victim_description,
          dressCode: scenarioRow.dress_code,
        }
      : null,
    characters: characterRows.map((c) => ({
      id: c.id,
      key: c.key,
      name: c.name,
      gender: c.gender,
      role: c.role,
      publicDescription: c.public_description,
      look: c.look,
      playerId: c.player_id,
      arrestStatus: c.arrest_status,
    })),
    mySecret: secretRow
      ? {
          isKiller: secretRow.is_killer,
          relationToVictim: secretRow.relation_to_victim,
          backstory: secretRow.backstory,
          secret: secretRow.secret,
          alibi: secretRow.alibi,
          apparentMotive: secretRow.apparent_motive,
          objectives: secretRow.objectives ?? [],
          knowledge: secretRow.knowledge ?? [],
          killerGuidance: secretRow.killer_guidance,
        }
      : null,
    phases: phaseRows.map((p) => ({
      idx: p.idx,
      kind: p.kind,
      actNumber: p.act_number,
      title: p.title,
      targetSeconds: p.target_seconds,
    })),
    messages: visibleMessages.map((m) => ({
      id: m.id,
      phaseIdx: m.phase_idx,
      kind: m.kind,
      title: m.title,
      body: m.body,
      payload: m.payload ?? {},
      releasedAt: m.released_at!,
      private: m.recipient_character_id !== null,
    })),
    sideQuests: myCharacter
      ? sqRows
          .filter((s) => s.owner_character_id === myCharacter.id)
          .map((s) => ({
            id: s.id,
            targetCharacterId: s.target_character_id,
            description: s.description,
            points: s.points,
            status: s.status,
          }))
      : [],
    pendingConfirmations: myCharacter
      ? sqRows
          .filter((s) => s.target_character_id === myCharacter.id && s.status === "claimed")
          .map((s) => ({ sideQuestId: s.id, ownerCharacterId: s.owner_character_id, prompt: s.target_prompt }))
      : [],
    sideQuestStats: { total: sqRows.length, confirmed: sqRows.filter((s) => s.status === "confirmed").length },
    vote,
    scores: scoreBoard,
    solution: solutionRow
      ? {
          killerCharacterId: solutionRow.killer_character_id,
          motive: solutionRow.motive,
          method: solutionRow.method,
          explanation: solutionRow.explanation,
          timeline: solutionRow.timeline ?? [],
        }
      : null,
    nextReleaseAt,
  };
}
