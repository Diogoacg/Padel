create extension if not exists "pgcrypto";

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rating integer not null default 1000,
  matches integer not null default 0,
  wins integer not null default 0,
  created_at timestamptz not null default now(),
  constraint players_name_not_blank check (length(trim(name)) > 0),
  constraint players_rating_positive check (rating >= 0),
  constraint players_record_valid check (matches >= 0 and wins >= 0 and wins <= matches)
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  played_at date not null default current_date,
  team_a_player_1 uuid not null references public.players(id) on delete restrict,
  team_a_player_2 uuid not null references public.players(id) on delete restrict,
  team_b_player_1 uuid not null references public.players(id) on delete restrict,
  team_b_player_2 uuid not null references public.players(id) on delete restrict,
  score_a integer not null,
  score_b integer not null,
  set_1_a integer not null default 6,
  set_1_b integer not null default 4,
  set_2_a integer not null default 6,
  set_2_b integer not null default 4,
  set_3_a integer not null default 0,
  set_3_b integer not null default 0,
  rating_delta integer not null default 0,
  created_at timestamptz not null default now(),
  constraint positive_scores check (score_a >= 0 and score_b >= 0),
  constraint positive_set_scores check (
    set_1_a >= 0 and set_1_b >= 0 and
    set_2_a >= 0 and set_2_b >= 0 and
    set_3_a >= 0 and set_3_b >= 0
  ),
  constraint different_players check (
    team_a_player_1 <> team_a_player_2 and
    team_a_player_1 <> team_b_player_1 and
    team_a_player_1 <> team_b_player_2 and
    team_a_player_2 <> team_b_player_1 and
    team_a_player_2 <> team_b_player_2 and
    team_b_player_1 <> team_b_player_2
  ),
  constraint no_draws check (score_a <> score_b)
);

alter table public.matches
  add column if not exists set_1_a integer not null default 6,
  add column if not exists set_1_b integer not null default 4,
  add column if not exists set_2_a integer not null default 6,
  add column if not exists set_2_b integer not null default 4,
  add column if not exists set_3_a integer not null default 0,
  add column if not exists set_3_b integer not null default 0;

alter table public.matches
  drop constraint if exists positive_set_scores;

update public.matches
set
  set_1_a = score_a,
  set_1_b = score_b,
  set_2_a = score_a,
  set_2_b = score_b,
  set_3_a = 0,
  set_3_b = 0,
  score_a = case when score_a > score_b then 2 else 0 end,
  score_b = case when score_b > score_a then 2 else 0 end
where not (
  score_a in (0, 1, 2) and
  score_b in (0, 1, 2) and
  ((score_a = 2 and score_b in (0, 1)) or (score_b = 2 and score_a in (0, 1)))
);

alter table public.matches
  add constraint positive_set_scores check (
    set_1_a >= 0 and set_1_b >= 0 and
    set_2_a >= 0 and set_2_b >= 0 and
    set_3_a >= 0 and set_3_b >= 0
  );

alter table public.matches
  drop constraint if exists best_of_three_sets;

alter table public.matches
  add constraint best_of_three_sets check (
    score_a in (0, 1, 2) and
    score_b in (0, 1, 2) and
    ((score_a = 2 and score_b in (0, 1)) or (score_b = 2 and score_a in (0, 1)))
  );

create index if not exists matches_played_at_idx
  on public.matches (played_at desc);

create index if not exists matches_team_a_player_1_idx
  on public.matches (team_a_player_1);

create index if not exists matches_team_a_player_2_idx
  on public.matches (team_a_player_2);

create index if not exists matches_team_b_player_1_idx
  on public.matches (team_b_player_1);

create index if not exists matches_team_b_player_2_idx
  on public.matches (team_b_player_2);

alter table public.players enable row level security;
alter table public.matches enable row level security;

drop policy if exists "Public players read" on public.players;
drop policy if exists "Public players insert" on public.players;
drop policy if exists "Public players update" on public.players;
drop policy if exists "Public matches read" on public.matches;
drop policy if exists "Public matches insert" on public.matches;
drop policy if exists "Public matches delete" on public.matches;

create policy "Public players read"
  on public.players for select
  to anon, authenticated
  using (true);

create policy "Public players insert"
  on public.players for insert
  to anon, authenticated
  with check (true);

create policy "Public players update"
  on public.players for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "Public matches read"
  on public.matches for select
  to anon, authenticated
  using (true);

create policy "Public matches insert"
  on public.matches for insert
  to anon, authenticated
  with check (true);

create policy "Public matches delete"
  on public.matches for delete
  to anon, authenticated
  using (true);
