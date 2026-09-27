-- Long absence: a growing part of the transient penalty becomes a one-time,
-- season-scoped base Elo loss at the first completed match after day 60.
-- Snapshot all pre-change data before replaying any season in this transaction.
insert into padel_internal.rating_snapshots (algorithm, players, matches, rating_events)
select
  'elo-long-absence-20260927',
  coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.players p), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.matches m), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.rating_events e), '[]'::jsonb)
on conflict (algorithm) do nothing;

alter table public.players add column if not exists inactivity_forfeit integer not null default 0;
alter table public.rating_events add column if not exists inactivity_forfeit integer not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.players'::regclass
    and conname = 'players_inactivity_forfeit_valid') then
    alter table public.players add constraint players_inactivity_forfeit_valid check (inactivity_forfeit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.rating_events'::regclass
    and conname = 'rating_events_inactivity_forfeit_valid') then
    alter table public.rating_events add constraint rating_events_inactivity_forfeit_valid check (inactivity_forfeit >= 0);
  end if;
end;
$$;

-- Day 60 is fully recoverable. From day 61, 10 percentage points of the
-- accumulated temporary penalty are forfeited per commenced week, capped at 50%.
create or replace function public.inactivity_forfeit_points(p_last_played_at date, p_returned_at date)
returns integer
language sql
immutable
set search_path = public
as $$
  select case when $2 - $1 <= 60 then 0 else round(
    public.inactivity_decay_points($1, $2) *
    least(50, 10 * ceil(($2 - $1 - 60)::numeric / 7)) / 100
  )::integer end;
$$;

create or replace function public.recompute_season_rating_history(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Lisbon'
as $$
declare
  v_season public.seasons;
  v_match public.matches;
  v_player record;
  v_winners uuid[];
  v_losers uuid[];
  v_ids uuid[];
  v_side text;
  v_win_average numeric;
  v_loss_average numeric;
  v_delta integer;
  v_after integer;
  v_as_of date;
begin
  select * into v_season from public.seasons where id = p_season_id;
  if v_season.id is null then raise exception 'Epoca nao encontrada.'; end if;

  -- Keep the same lock order in every rating mutation.
  lock table public.matches in exclusive mode;
  lock table public.players in exclusive mode;
  lock table public.rating_events in exclusive mode;

  drop table if exists pg_temp.rating_replay;
  create temp table rating_replay (
    id uuid primary key,
    skill integer not null,
    games integer not null,
    wins integer not null,
    last_played date,
    forfeited integer not null default 0,
    last_forfeit integer not null default 0
  ) on commit drop;
  insert into pg_temp.rating_replay (id, skill, games, wins)
  select id, 1000, 0, 0 from public.players;

  delete from public.rating_events e
  using public.matches m
  where e.match_id = m.id and m.season_id = p_season_id;

  for v_match in
    select * from public.matches
    where season_id = p_season_id and status = 'completed'
    order by played_at, created_at, id
  loop
    v_ids := array[
      v_match.team_a_player_1, v_match.team_a_player_2,
      v_match.team_b_player_1, v_match.team_b_player_2
    ];
    if (select count(*) from pg_temp.rating_replay where id = any(v_ids)) <> 4
       or (select count(distinct id) from unnest(v_ids) as id) <> 4 then
      raise exception 'Jogo % tem jogadores inválidos.', v_match.id;
    end if;

    if v_match.score_a > v_match.score_b then
      v_winners := v_ids[1:2]; v_losers := v_ids[3:4]; v_side := 'a';
    else
      v_winners := v_ids[3:4]; v_losers := v_ids[1:2]; v_side := 'b';
    end if;
    -- Charge only when the player returns. Replays and corrections derive the
    -- same loss from completed matches, without repeatedly charging the daily job.
    update pg_temp.rating_replay r set
      forfeited = r.forfeited + least(r.skill, public.inactivity_forfeit_points(
        coalesce(r.last_played, v_season.starts_at), v_match.played_at)),
      last_forfeit = least(r.skill, public.inactivity_forfeit_points(
        coalesce(r.last_played, v_season.starts_at), v_match.played_at)),
      skill = greatest(0, r.skill - public.inactivity_forfeit_points(
        coalesce(r.last_played, v_season.starts_at), v_match.played_at))
    where r.id = any(v_ids);
    select avg(skill) into v_win_average from pg_temp.rating_replay where id = any(v_winners);
    select avg(skill) into v_loss_average from pg_temp.rating_replay where id = any(v_losers);
    v_delta := public.calculate_team_elo_delta(
      v_win_average, v_loss_average, v_side,
      v_match.set_1_a, v_match.set_1_b, v_match.set_2_a, v_match.set_2_b,
      v_match.set_3_a, v_match.set_3_b
    );
    update public.matches set rating_delta = v_delta where id = v_match.id;

    for v_player in
      select * from pg_temp.rating_replay where id = any(v_ids) order by id
    loop
      v_after := case when v_player.id = any(v_winners)
        then v_player.skill + v_delta
        else greatest(0, v_player.skill - v_delta) end;
      insert into public.rating_events (
        match_id, player_id, rating_before, rating_after,
        matches_before, matches_after, wins_before, wins_after, inactivity_forfeit
      ) values (
        v_match.id, v_player.id, v_player.skill, v_after,
        v_player.games, v_player.games + 1,
        v_player.wins, v_player.wins + case when v_player.id = any(v_winners) then 1 else 0 end,
        v_player.last_forfeit
      );
      update pg_temp.rating_replay set
        skill = v_after,
        games = v_player.games + 1,
        wins = v_player.wins + case when v_player.id = any(v_winners) then 1 else 0 end,
        last_played = v_match.played_at
      where id = v_player.id;
    end loop;
  end loop;

  if v_season.active then
    v_as_of := current_date;
    update public.players p set
      base_rating = r.skill,
      rating = greatest(0, r.skill - public.inactivity_decay_points(
        coalesce(r.last_played, v_season.starts_at), v_as_of)),
      matches = r.games,
      inactivity_forfeit = r.forfeited,
      wins = r.wins,
      inactivity_penalty = public.inactivity_decay_points(
        coalesce(r.last_played, v_season.starts_at), v_as_of),
      last_decay_at = case when public.inactivity_decay_points(
        coalesce(r.last_played, v_season.starts_at), v_as_of) > 0
        then v_as_of else null end
    from pg_temp.rating_replay r where p.id = r.id;
  end if;
end;
$$;

create or replace function public.start_new_season(
  p_name text, p_starts_at date default current_date
)
returns public.seasons
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Lisbon'
as $$
declare
  v_season public.seasons;
begin
  if length(trim(p_name)) = 0 then raise exception 'Da um nome a epoca.'; end if;
  update public.seasons set
    active = false,
    ends_at = coalesce(ends_at, greatest(starts_at, p_starts_at - 1))
  where active;
  insert into public.seasons (name, starts_at, active)
  values (trim(p_name), p_starts_at, true) returning * into v_season;
  update public.players set
    rating = 1000, base_rating = 1000,
    matches = 0, wins = 0, inactivity_penalty = 0, inactivity_forfeit = 0, last_decay_at = null
  where true;
  return v_season;
end;
$$;

create or replace function public.season_player_standings(p_season_id uuid)
returns table(player_id uuid, name text, rating integer, matches integer, wins integer)
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Lisbon'
as $$
declare
  v_season public.seasons;
  v_match public.matches;
  v_winners uuid[];
  v_losers uuid[];
  v_side text;
  v_win_average numeric;
  v_loss_average numeric;
  v_delta integer;
  v_as_of date;
begin
  select * into v_season from public.seasons where id = p_season_id;
  if v_season.id is null then raise exception 'Epoca nao encontrada.'; end if;
  v_as_of := case when v_season.active then current_date
    else least(current_date, coalesce(v_season.ends_at, current_date)) end;
  drop table if exists pg_temp.season_standings;
  create temp table season_standings (
    standing_player_id uuid primary key,
    standing_name text not null,
    standing_skill integer not null,
    standing_matches integer not null,
    standing_wins integer not null,
    last_played date
  ) on commit drop;
  insert into pg_temp.season_standings
    (standing_player_id, standing_name, standing_skill, standing_matches, standing_wins)
  select p.id, p.name, 1000, 0, 0 from public.players p;

  for v_match in
    select * from public.matches
    where season_id = p_season_id and status = 'completed'
    order by played_at, created_at, id
  loop
    if v_match.score_a > v_match.score_b then
      v_winners := array[v_match.team_a_player_1, v_match.team_a_player_2];
      v_losers := array[v_match.team_b_player_1, v_match.team_b_player_2];
      v_side := 'a';
    else
      v_winners := array[v_match.team_b_player_1, v_match.team_b_player_2];
      v_losers := array[v_match.team_a_player_1, v_match.team_a_player_2];
      v_side := 'b';
    end if;
    update pg_temp.season_standings s set
      standing_skill = greatest(0, s.standing_skill - public.inactivity_forfeit_points(
        coalesce(s.last_played, v_season.starts_at), v_match.played_at))
    where s.standing_player_id in (
      v_match.team_a_player_1, v_match.team_a_player_2,
      v_match.team_b_player_1, v_match.team_b_player_2
    );
    select avg(standing_skill) into v_win_average
    from pg_temp.season_standings where standing_player_id = any(v_winners);
    select avg(standing_skill) into v_loss_average
    from pg_temp.season_standings where standing_player_id = any(v_losers);
    v_delta := public.calculate_team_elo_delta(
      v_win_average, v_loss_average, v_side,
      v_match.set_1_a, v_match.set_1_b, v_match.set_2_a, v_match.set_2_b,
      v_match.set_3_a, v_match.set_3_b
    );
    update pg_temp.season_standings set
      standing_skill = standing_skill + v_delta,
      standing_matches = standing_matches + 1,
      standing_wins = standing_wins + 1,
      last_played = v_match.played_at
    where standing_player_id = any(v_winners);
    update pg_temp.season_standings set
      standing_skill = greatest(0, standing_skill - v_delta),
      standing_matches = standing_matches + 1,
      last_played = v_match.played_at
    where standing_player_id = any(v_losers);
  end loop;

  return query select
    s.standing_player_id, s.standing_name,
    greatest(0, s.standing_skill - public.inactivity_decay_points(
      coalesce(s.last_played, v_season.starts_at), v_as_of)),
    s.standing_matches, s.standing_wins
  from pg_temp.season_standings s
  order by 3 desc, 5 desc, 2 asc;
end;
$$;

-- Bring history and live player standings into agreement, transactionally.
do $$
declare v_season record;
begin
  for v_season in select id from public.seasons order by active, starts_at loop
    perform public.recompute_season_rating_history(v_season.id);
  end loop;
end;
$$;
