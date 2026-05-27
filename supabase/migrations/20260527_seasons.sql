create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at date not null default current_date,
  ends_at date,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  constraint seasons_name_not_blank check (length(trim(name)) > 0),
  constraint seasons_dates_valid check (ends_at is null or ends_at >= starts_at)
);

create unique index if not exists seasons_one_active_idx
  on public.seasons (active)
  where active;

alter table public.seasons enable row level security;

drop policy if exists "Public seasons read" on public.seasons;
drop policy if exists "Public seasons insert" on public.seasons;
drop policy if exists "Public seasons update" on public.seasons;

create policy "Public seasons read"
  on public.seasons for select
  to anon, authenticated
  using (true);

create policy "Public seasons insert"
  on public.seasons for insert
  to anon, authenticated
  with check (true);

create policy "Public seasons update"
  on public.seasons for update
  to anon, authenticated
  using (true)
  with check (true);

insert into public.seasons (name, starts_at, active)
select 'Epoca inicial', current_date, true
where not exists (
  select 1
  from public.seasons
  where active
);

alter table public.matches
  add column if not exists season_id uuid references public.seasons(id) on delete set null;

update public.matches
set season_id = (
  select id
  from public.seasons
  where active
  order by created_at desc
  limit 1
)
where season_id is null;

create index if not exists matches_season_id_idx
  on public.matches (season_id);

create or replace function public.current_season_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season_id uuid;
begin
  select id
  into v_season_id
  from public.seasons
  where active
  order by created_at desc
  limit 1;

  if v_season_id is null then
    insert into public.seasons (name, starts_at, active)
    values ('Epoca inicial', current_date, true)
    returning id into v_season_id;
  end if;

  return v_season_id;
end;
$$;

create or replace function public.start_new_season(
  p_name text,
  p_starts_at date default current_date
)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
begin
  if length(trim(p_name)) = 0 then
    raise exception 'Da um nome a epoca.';
  end if;

  update public.seasons
  set
    active = false,
    ends_at = coalesce(ends_at, greatest(starts_at, p_starts_at - 1))
  where active;

  insert into public.seasons (name, starts_at, active)
  values (trim(p_name), p_starts_at, true)
  returning * into v_season;

  update public.players
  set
    rating = 1000,
    matches = 0,
    wins = 0
  where true;

  return v_season;
end;
$$;

create or replace function public.register_match(
  p_played_at date,
  p_team_a_player_1 uuid,
  p_team_a_player_2 uuid,
  p_team_b_player_1 uuid,
  p_team_b_player_2 uuid,
  p_score_a integer,
  p_score_b integer,
  p_set_1_a integer,
  p_set_1_b integer,
  p_set_2_a integer,
  p_set_2_b integer,
  p_set_3_a integer,
  p_set_3_b integer,
  p_rating_delta integer
)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_player public.players;
  v_player_ids uuid[] := array[
    p_team_a_player_1,
    p_team_a_player_2,
    p_team_b_player_1,
    p_team_b_player_2
  ];
  v_winners uuid[];
  v_losers uuid[];
  v_winner_side text;
  v_winner_average numeric;
  v_loser_average numeric;
  v_rating_delta integer;
  v_rating_after integer;
  v_matches_after integer;
  v_wins_after integer;
begin
  if (
    select count(distinct player_id)
    from unnest(v_player_ids) as player_id
  ) <> 4 then
    raise exception 'Escolhe 4 jogadores diferentes.';
  end if;

  if p_score_a > p_score_b then
    v_winners := array[p_team_a_player_1, p_team_a_player_2];
    v_losers := array[p_team_b_player_1, p_team_b_player_2];
    v_winner_side := 'a';
  elsif p_score_b > p_score_a then
    v_winners := array[p_team_b_player_1, p_team_b_player_2];
    v_losers := array[p_team_a_player_1, p_team_a_player_2];
    v_winner_side := 'b';
  else
    raise exception 'O jogo precisa de vencedor.';
  end if;

  perform 1
  from public.players
  where id = any(v_player_ids)
  for update;

  if (
    select count(*)
    from public.players
    where id = any(v_player_ids)
  ) <> 4 then
    raise exception 'Um dos jogadores ja nao existe.';
  end if;

  select avg(rating)
  into v_winner_average
  from public.players
  where id = any(v_winners);

  select avg(rating)
  into v_loser_average
  from public.players
  where id = any(v_losers);

  v_rating_delta := public.calculate_team_elo_delta(
    v_winner_average,
    v_loser_average,
    v_winner_side,
    p_set_1_a,
    p_set_1_b,
    p_set_2_a,
    p_set_2_b,
    p_set_3_a,
    p_set_3_b
  );

  insert into public.matches (
    season_id,
    played_at,
    team_a_player_1,
    team_a_player_2,
    team_b_player_1,
    team_b_player_2,
    score_a,
    score_b,
    set_1_a,
    set_1_b,
    set_2_a,
    set_2_b,
    set_3_a,
    set_3_b,
    rating_delta
  )
  values (
    public.current_season_id(),
    p_played_at,
    p_team_a_player_1,
    p_team_a_player_2,
    p_team_b_player_1,
    p_team_b_player_2,
    p_score_a,
    p_score_b,
    p_set_1_a,
    p_set_1_b,
    p_set_2_a,
    p_set_2_b,
    p_set_3_a,
    p_set_3_b,
    v_rating_delta
  )
  returning * into v_match;

  for v_player in
    select *
    from public.players
    where id = any(v_player_ids)
  loop
    if v_player.id = any(v_winners) then
      v_rating_after := v_player.rating + v_rating_delta;
      v_matches_after := v_player.matches + 1;
      v_wins_after := v_player.wins + 1;
    else
      v_rating_after := greatest(0, v_player.rating - v_rating_delta);
      v_matches_after := v_player.matches + 1;
      v_wins_after := v_player.wins;
    end if;

    insert into public.rating_events (
      match_id,
      player_id,
      rating_before,
      rating_after,
      matches_before,
      matches_after,
      wins_before,
      wins_after
    )
    values (
      v_match.id,
      v_player.id,
      v_player.rating,
      v_rating_after,
      v_player.matches,
      v_matches_after,
      v_player.wins,
      v_wins_after
    );

    update public.players
    set
      rating = v_rating_after,
      matches = v_matches_after,
      wins = v_wins_after
    where id = v_player.id;
  end loop;

  return v_match;
end;
$$;

grant execute on function public.current_season_id() to anon, authenticated;
grant execute on function public.start_new_season(text, date) to anon, authenticated;
grant execute on function public.register_match(
  date,
  uuid,
  uuid,
  uuid,
  uuid,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer
) to anon, authenticated;
