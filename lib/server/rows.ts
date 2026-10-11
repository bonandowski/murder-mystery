import type { PhaseKind } from "@/lib/game/phases";

export type GameStatus = "lobby" | "generating" | "ready" | "in_progress" | "ended";

export interface GameRow {
  id: string;
  code: string;
  status: GameStatus;
  settings: unknown;
  generation_step: number;
  generation_error: string | null;
  generation_count: number;
  generation_attempts: number;
  current_phase_idx: number | null;
  phase_started_at: string | null;
  paused_at: string | null;
  paused_total_seconds: number;
  phase_extra_seconds: number;
  killer_arrested: boolean;
  ending_reason: string | null;
  version: number;
  created_at: string;
}

export interface PlayerRow {
  id: string;
  game_id: string;
  nickname: string;
  character_pref: "m" | "f" | "any";
  is_host: boolean;
  is_spectator: boolean;
  token_hash: string;
  last_seen_at: string;
  inbox_read_at: string | null;
  joined_at: string;
}

export interface ScenarioRow {
  game_id: string;
  title: string;
  setting: string;
  premise: string;
  victim_name: string;
  victim_description: string;
  dress_code: string;
}

export interface CharacterRow {
  id: string;
  game_id: string;
  player_id: string | null;
  key: string;
  name: string;
  gender: string;
  role: string;
  public_description: string;
  look: string;
  sort_order: number;
  arrest_status: "killer" | "exonerated" | null;
}

export interface SecretRow {
  character_id: string;
  game_id: string;
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
}

export interface SolutionRow {
  game_id: string;
  killer_character_id: string;
  motive: string;
  method: string;
  timeline: { time: string; event: string }[];
  explanation: string;
  key_clues: { id: string; text: string }[];
}

export interface PhaseRow {
  id: string;
  game_id: string;
  idx: number;
  kind: PhaseKind;
  act_number: number | null;
  title: string;
  target_seconds: number;
}

export type MessageKind =
  | "narration"
  | "hint"
  | "clue"
  | "event"
  | "killer_tip"
  | "system"
  | "reveal"
  | "sq_confirm_request"
  | "sq_result";

export interface MessageRow {
  id: string;
  game_id: string;
  phase_idx: number | null;
  offset_seconds: number;
  recipient_character_id: string | null;
  kind: MessageKind;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  released_at: string | null;
  created_at: string;
}

export interface SideQuestRow {
  id: string;
  game_id: string;
  owner_character_id: string;
  target_character_id: string;
  description: string;
  target_prompt: string;
  points: number;
  status: "open" | "claimed" | "confirmed" | "rejected";
  claimed_at: string | null;
  resolved_at: string | null;
}

export interface VoteRoundRow {
  id: string;
  game_id: string;
  phase_idx: number;
  round_number: number;
  kind: "vote" | "final_vote";
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  result_kind: "killer" | "innocent" | "tie" | "none" | null;
  result_character_id: string | null;
  tally: Record<string, number>;
}

export interface VoteRow {
  round_id: string;
  game_id: string;
  voter_player_id: string;
  accused_character_id: string;
}

export interface ScoreEventRow {
  id: string;
  game_id: string;
  player_id: string;
  points: number;
  reason: string;
  dedupe_key: string;
}
