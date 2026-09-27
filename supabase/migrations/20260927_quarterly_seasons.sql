-- Civil-quarter seasons. All match history is partitioned by played_at and then replayed.
-- Capture the complete pre-migration state, including legacy season metadata.
alter table padel_internal.rating_snapshots
  add column if not exists seasons jsonb not null default '[]'::jsonb;

insert into padel_internal.rating_snapshots (algorithm, players, matches, rating_events, seasons)
select
  'elo-quarterly-20260927',
  coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.players p), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.matches m), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.rating_events e), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.seasons s), '[]'::jsonb)
on conflict (algorithm) do nothing;

alter table public.seasons
  add column if not exists quarter_year integer,
  add column if not exists quarter_number integer;

create or replace function public.quarter_bounds(
  p_played_at date,
  out season_name text,
  out starts_at date,
  out ends_at date,
  out quarter_year integer,
  out quarter_number integer
)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_year integer := extract(year from p_played_at)::integer;
  v_month integer := extract(month from p_played_at)::integer;
begin
  quarter_year := v_year;
  quarter_number := ((v_month - 1) / 3) + 1;
  starts_at := make_date(v_year, (quarter_number - 1) * 3 + 1, 1);
  ends_at := (starts_at + interval '3 months - 1 day')::date;
  season_name := 'Q' || quarter_number::text || ' ' || quarter_year::text;
end;
$$;

-- Keep the former active season's identifier for the current quarter where possible.
create temporary table quarter_migration_active_id on commit drop as
select id from public.seasons where active limit 1;
update public.seasons set active = false;
update public.seasons s set
  quarter_year = extract(year from s.starts_at)::integer,
  quarter_number = ((extract(month from s.starts_at)::integer - 1) / 3) + 1,
  semester_year = null,
  semester_half = null;
update public.seasons s set
  quarter_year = extract(year from (now() at time zone 'Europe/Lisbon'))::integer,
  quarter_number = ((extract(month from (now() at time zone 'Europe/Lisbon'))::integer - 1) / 3) + 1
where s.id in (select id from quarter_migration_active_id);

alter table public.seasons drop constraint if exists seasons_quarter_year_valid;
alter table public.seasons add constraint seasons_quarter_year_valid
  check (quarter_year is null or quarter_year >= 2000);
alter table public.seasons drop constraint if exists seasons_quarter_number_valid;
alter table public.seasons add constraint seasons_quarter_number_valid
  check (quarter_number is null or quarter_number between 1 and 4);
drop index if exists public.seasons_semester_unique_idx;

-- Select one canonical id per quarter. Reassign all games before deleting any
-- duplicate, since a legacy season can contain games from multiple quarters.
create temporary table quarter_migration_canonical (
  quarter_year integer not null,
  quarter_number integer not null,
  keep_id uuid not null,
  primary key (quarter_year, quarter_number)
) on commit drop;
do $$
declare
  v_row record;
  v_keep uuid;
  v_bounds record;
  v_today date := (now() at time zone 'Europe/Lisbon')::date;
begin
  for v_row in
    select distinct quarter_year, quarter_number
    from public.seasons
    where quarter_year is not null and quarter_number is not null
    union
    select extract(year from played_at)::integer,
      ((extract(month from played_at)::integer - 1) / 3) + 1
    from public.matches where played_at is not null
    union
    select extract(year from v_today)::integer,
      ((extract(month from v_today)::integer - 1) / 3) + 1
    order by 1, 2
  loop
    select id into v_keep
    from public.seasons
    where quarter_year = v_row.quarter_year and quarter_number = v_row.quarter_number
    order by (id in (select id from quarter_migration_active_id)) desc, id
    limit 1;
    select * into v_bounds from public.quarter_bounds(
      make_date(v_row.quarter_year, (v_row.quarter_number - 1) * 3 + 1, 1));
    if v_keep is null then
      insert into public.seasons (name, starts_at, ends_at, active, quarter_year, quarter_number)
      values (v_bounds.season_name, v_bounds.starts_at, v_bounds.ends_at,
        v_bounds.quarter_year = extract(year from v_today)::integer
          and v_bounds.quarter_number = ((extract(month from v_today)::integer - 1) / 3) + 1,
        v_bounds.quarter_year, v_bounds.quarter_number)
      returning id into v_keep;
    else
      update public.seasons set
        name = v_bounds.season_name, starts_at = v_bounds.starts_at, ends_at = v_bounds.ends_at,
        active = v_bounds.quarter_year = extract(year from v_today)::integer
          and v_bounds.quarter_number = ((extract(month from v_today)::integer - 1) / 3) + 1
      where id = v_keep;
    end if;
    insert into quarter_migration_canonical (quarter_year, quarter_number, keep_id)
    values (v_row.quarter_year, v_row.quarter_number, v_keep);
  end loop;
end;
$$;

update public.matches m set season_id = c.keep_id
from quarter_migration_canonical c
where m.played_at is not null
  and extract(year from m.played_at)::integer = c.quarter_year
  and ((extract(month from m.played_at)::integer - 1) / 3) + 1 = c.quarter_number;

delete from public.seasons s
using quarter_migration_canonical c
where s.quarter_year = c.quarter_year and s.quarter_number = c.quarter_number
  and s.id <> c.keep_id;

create unique index if not exists seasons_quarter_unique_idx
  on public.seasons (quarter_year, quarter_number)
  where quarter_year is not null and quarter_number is not null;

create index if not exists matches_played_at_season_id_idx
  on public.matches (season_id, played_at);

update public.matches m set season_id = s.id
from public.seasons s
where m.played_at is not null
  and s.quarter_year = extract(year from m.played_at)::integer
  and s.quarter_number = ((extract(month from m.played_at)::integer - 1) / 3) + 1;

alter table public.matches alter column season_id set not null;

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
      forfeited = r.forfeited + least(r.skill, case when r.last_played is null then 0 else
        public.inactivity_forfeit_points(r.last_played, v_match.played_at) end),
      last_forfeit = least(r.skill, case when r.last_played is null then 0 else
        public.inactivity_forfeit_points(r.last_played, v_match.played_at) end),
      skill = greatest(0, r.skill - case when r.last_played is null then 0 else
        public.inactivity_forfeit_points(r.last_played, v_match.played_at) end)
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
      rating = greatest(0, r.skill - case when r.last_played is null then 0 else
        public.inactivity_decay_points(r.last_played, v_as_of) end),
      matches = r.games,
      inactivity_forfeit = r.forfeited,
      wins = r.wins,
      inactivity_penalty = case when r.last_played is null then 0 else
        public.inactivity_decay_points(r.last_played, v_as_of) end,
      last_decay_at = case when case when r.last_played is null then 0 else
        public.inactivity_decay_points(r.last_played, v_as_of) end > 0
        then v_as_of else null end
    from pg_temp.rating_replay r where p.id = r.id;
  end if;
end;
$$;

create or replace function public.apply_inactivity_decay(
  p_today date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Lisbon'
as $$
declare
  v_season public.seasons;
  v_player public.players;
  v_penalty integer;
  v_last_played date;
  v_changed integer := 0;
begin
  select * into v_season from public.seasons
  where active order by created_at desc limit 1;
  if v_season.id is null then return 0; end if;

  for v_player in select * from public.players order by id for update loop
    v_last_played := public.player_last_played_at(v_player.id, v_season.id);
    v_penalty := case when v_last_played is null then 0
      else public.inactivity_decay_points(v_last_played, p_today) end;
    if v_penalty <> v_player.inactivity_penalty
       or v_player.rating <> greatest(0, v_player.base_rating - v_penalty) then
      update public.players set
        rating = greatest(0, base_rating - v_penalty),
        inactivity_penalty = v_penalty,
        last_decay_at = case when v_penalty > 0 then p_today else null end
      where id = v_player.id;
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
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
      standing_skill = greatest(0, s.standing_skill - case when s.last_played is null then 0 else
        public.inactivity_forfeit_points(s.last_played, v_match.played_at) end)
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
    greatest(0, s.standing_skill - case when s.last_played is null then 0 else
      public.inactivity_decay_points(s.last_played, v_as_of) end),
    s.standing_matches, s.standing_wins
  from pg_temp.season_standings s
  order by 3 desc, 5 desc, 2 asc;
end;
$$;

create or replace function public.season_for_date(p_played_at date)
returns uuid
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Lisbon'
as $$
declare
  v_bounds record;
  v_season_id uuid;
  v_is_current boolean;
  v_was_active boolean;
begin
  if p_played_at is null then raise exception 'Data do jogo obrigatoria.'; end if;
  select * into v_bounds from public.quarter_bounds(p_played_at);
  v_is_current := p_played_at = current_date;

  -- Fast path: a read of the current quarter must not replay ratings or lock
  -- every player. Backdated games within that quarter keep it active as well.
  select id into v_season_id from public.seasons
  where quarter_year = v_bounds.quarter_year
    and quarter_number = v_bounds.quarter_number and active;
  if v_season_id is not null then
    return v_season_id;
  end if;

  if v_is_current then
    -- Mutations lock matches before seasons, matching register_match and replay.
    lock table public.matches in exclusive mode;
    select id into v_season_id from public.seasons
    where quarter_year = v_bounds.quarter_year
      and quarter_number = v_bounds.quarter_number and active;
    if v_season_id is not null then return v_season_id; end if;
    update public.seasons set active = false where active;
  end if;

  select id, active into v_season_id, v_was_active
  from public.seasons
  where quarter_year = v_bounds.quarter_year and quarter_number = v_bounds.quarter_number;
  if v_season_id is null then
    insert into public.seasons (name, starts_at, ends_at, active, quarter_year, quarter_number)
    values (v_bounds.season_name, v_bounds.starts_at, v_bounds.ends_at, v_is_current,
      v_bounds.quarter_year, v_bounds.quarter_number)
    on conflict (quarter_year, quarter_number) where quarter_year is not null and quarter_number is not null
    do update set name = excluded.name, starts_at = excluded.starts_at, ends_at = excluded.ends_at
    returning id into v_season_id;
    v_was_active := false;
  else
    update public.seasons set name = v_bounds.season_name, starts_at = v_bounds.starts_at,
      ends_at = v_bounds.ends_at, active = v_is_current
    where id = v_season_id;
  end if;

  if v_is_current and not coalesce(v_was_active, false) then
    perform public.recompute_season_rating_history(v_season_id);
  end if;
  return v_season_id;
end;
$$;

create or replace function public.current_season_id()
returns uuid
language plpgsql
security definer
set search_path = public
set timezone = 'Europe/Lisbon'
as $$
begin
  return public.season_for_date(current_date);
end;
$$;

-- The period is automatic. Legacy manual season RPCs cannot create, delete, or
-- reset an arbitrary ranking.
create or replace function public.start_new_season(p_name text, p_starts_at date default current_date)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'As épocas são criadas automaticamente por trimestre civil.';
end;
$$;

create or replace function public.switch_active_season(p_season_id uuid)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'A época ativa muda automaticamente no início de cada trimestre.';
end;
$$;

create or replace function public.delete_season(p_season_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'Não é possível apagar épocas trimestrais.';
end;
$$;

drop policy if exists "Public seasons insert" on public.seasons;
drop policy if exists "Public seasons update" on public.seasons;
drop policy if exists "Public seasons delete" on public.seasons;
revoke insert, update, delete on public.seasons from public, anon, authenticated;

-- Match writes must go through the atomic RPCs so season assignment, rating
-- replay, pending completion, edits, and deletes stay in sync.
drop policy if exists "Public matches insert" on public.matches;
drop policy if exists "Public matches delete" on public.matches;
revoke insert, update, delete on public.matches from public, anon, authenticated;

do $$
declare v_season record;
begin
  for v_season in select id from public.seasons order by quarter_year, quarter_number loop
    perform public.recompute_season_rating_history(v_season.id);
  end loop;
end;
$$;

-- Reassert the live quarter after replay (including an empty quarter, which is 1000/0).
select public.current_season_id();

grant execute on function public.quarter_bounds(date) to anon, authenticated;
grant execute on function public.current_season_id() to anon, authenticated;
revoke execute on function public.season_for_date(date) from public, anon, authenticated;
grant execute on function public.start_new_season(text, date) to anon, authenticated;
grant execute on function public.delete_season(uuid) to anon, authenticated;
