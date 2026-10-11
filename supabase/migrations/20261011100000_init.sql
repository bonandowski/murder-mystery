-- Cena con Delitto — schema iniziale.
--
-- Sicurezza: tutte le tabelle hanno RLS attiva e NESSUNA policy per anon/authenticated.
-- I client non leggono né scrivono mai direttamente: ogni accesso passa dalle API
-- Next.js (chiave secret/service role), che filtrano i dati per giocatore
-- (lib/server/view.ts). Così segreti dei personaggi e soluzione non possono
-- trapelare nemmeno con una chiave pubblica in mano.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Partite
-- ---------------------------------------------------------------------------
create table public.games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status text not null default 'lobby'
    check (status in ('lobby', 'generating', 'ready', 'in_progress', 'ended')),
  settings jsonb not null default '{}'::jsonb,

  -- pipeline di generazione
  generation_step int not null default 0,
  generation_error text,
  generation_count int not null default 0,
  generation_attempts int not null default 0,

  -- orologio della fase corrente (tutto calcolato da timestamp del server)
  current_phase_idx int,
  phase_started_at timestamptz,
  paused_at timestamptz,
  paused_total_seconds int not null default 0,
  phase_extra_seconds int not null default 0,

  killer_arrested boolean not null default false,
  ending_reason text,

  -- concorrenza ottimistica sulle transizioni
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Giocatori (identità = token casuale per partita, salvato come hash)
-- ---------------------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  nickname text not null,
  character_pref text not null default 'any' check (character_pref in ('m', 'f', 'any')),
  is_host boolean not null default false,
  is_spectator boolean not null default false,
  token_hash text not null unique,
  last_seen_at timestamptz not null default now(),
  inbox_read_at timestamptz,
  joined_at timestamptz not null default now()
);
create index players_game_idx on public.players (game_id);

-- ---------------------------------------------------------------------------
-- Storia generata
-- ---------------------------------------------------------------------------
create table public.generation_drafts (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  step int not null,
  data jsonb,
  errors jsonb,
  created_at timestamptz not null default now()
);
create index generation_drafts_game_idx on public.generation_drafts (game_id, step, created_at desc);
create index generation_drafts_created_idx on public.generation_drafts (created_at);

create table public.scenarios (
  game_id uuid primary key references public.games (id) on delete cascade,
  title text not null,
  setting text not null,
  premise text not null,
  victim_name text not null,
  victim_description text not null,
  dress_code text not null default '',
  created_at timestamptz not null default now()
);

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid references public.players (id) on delete set null,
  key text not null,
  name text not null,
  gender text not null default 'x',
  role text not null,
  public_description text not null,
  look text not null default '',
  sort_order int not null default 0,
  -- null | 'killer' (arrestato ed era il killer) | 'exonerated' (arrestato ma innocente)
  arrest_status text check (arrest_status in ('killer', 'exonerated')),
  unique (game_id, key)
);
create index characters_game_idx on public.characters (game_id);

create table public.character_secrets (
  character_id uuid primary key references public.characters (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  is_killer boolean not null default false,
  relation_to_victim text not null default '',
  backstory text not null default '',
  secret text not null default '',
  alibi text not null default '',
  apparent_motive text not null default '',
  objectives jsonb not null default '[]'::jsonb,
  knowledge jsonb not null default '[]'::jsonb,
  killer_guidance text not null default '',
  exoneration_reveal text not null default ''
);
create index character_secrets_game_idx on public.character_secrets (game_id);

create table public.game_solutions (
  game_id uuid primary key references public.games (id) on delete cascade,
  killer_character_id uuid not null references public.characters (id) on delete cascade,
  motive text not null,
  method text not null,
  timeline jsonb not null default '[]'::jsonb,
  explanation text not null,
  key_clues jsonb not null default '[]'::jsonb
);

create table public.phases (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  idx int not null,
  kind text not null
    check (kind in ('prologue', 'act', 'vote', 'final_vote', 'showdown', 'epilogue')),
  act_number int,
  title text not null,
  target_seconds int not null,
  unique (game_id, idx)
);

-- Messaggi programmati (phase_idx + offset) o istantanei (phase_idx null).
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  phase_idx int,
  offset_seconds int not null default 0,
  recipient_character_id uuid references public.characters (id) on delete cascade,
  kind text not null
    check (kind in ('narration', 'hint', 'clue', 'event', 'killer_tip', 'system', 'reveal',
                    'sq_confirm_request', 'sq_result')),
  title text not null default '',
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  released_at timestamptz,
  created_at timestamptz not null default now()
);
create index messages_game_released_idx on public.messages (game_id, released_at);
create index messages_game_pending_idx on public.messages (game_id, phase_idx) where released_at is null;

create table public.side_quests (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  owner_character_id uuid not null references public.characters (id) on delete cascade,
  target_character_id uuid not null references public.characters (id) on delete cascade,
  description text not null,
  target_prompt text not null,
  points int not null default 2,
  status text not null default 'open' check (status in ('open', 'claimed', 'confirmed', 'rejected')),
  claimed_at timestamptz,
  resolved_at timestamptz
);
create index side_quests_game_idx on public.side_quests (game_id);

-- ---------------------------------------------------------------------------
-- Votazioni e punteggi
-- ---------------------------------------------------------------------------
create table public.vote_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  phase_idx int not null,
  round_number int not null,
  kind text not null check (kind in ('vote', 'final_vote')),
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  result_kind text check (result_kind in ('killer', 'innocent', 'tie', 'none')),
  result_character_id uuid references public.characters (id) on delete set null,
  tally jsonb not null default '{}'::jsonb,
  unique (game_id, phase_idx)
);

create table public.votes (
  round_id uuid not null references public.vote_rounds (id) on delete cascade,
  game_id uuid not null references public.games (id) on delete cascade,
  voter_player_id uuid not null references public.players (id) on delete cascade,
  accused_character_id uuid not null references public.characters (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (round_id, voter_player_id)
);

create table public.score_events (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  points int not null,
  reason text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (game_id, dedupe_key)
);
create index score_events_game_idx on public.score_events (game_id);

-- ---------------------------------------------------------------------------
-- updated_at + version: ogni update della partita incrementa la versione,
-- così le transizioni con `where version = <attesa>` sono sicure.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: attiva ovunque, nessuna policy => accesso solo con chiave secret (server)
-- ---------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.generation_drafts enable row level security;
alter table public.scenarios enable row level security;
alter table public.characters enable row level security;
alter table public.character_secrets enable row level security;
alter table public.game_solutions enable row level security;
alter table public.phases enable row level security;
alter table public.messages enable row level security;
alter table public.side_quests enable row level security;
alter table public.vote_rounds enable row level security;
alter table public.votes enable row level security;
alter table public.score_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
