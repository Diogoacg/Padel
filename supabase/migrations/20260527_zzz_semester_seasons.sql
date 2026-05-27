alter table public.seasons
  add column if not exists semester_year integer,
  add column if not exists semester_half integer;

update public.seasons
set
  semester_year = extract(year from starts_at)::integer,
  semester_half = case when extract(month from starts_at)::integer <= 6 then 1 else 2 end
where semester_year is null
   or semester_half is null;

alter table public.seasons
  drop constraint if exists seasons_semester_year_valid;

alter table public.seasons
  add constraint seasons_semester_year_valid check (
    semester_year is null or semester_year >= 2000
  );

alter table public.seasons
  drop constraint if exists seasons_semester_half_valid;

alter table public.seasons
  add constraint seasons_semester_half_valid check (
    semester_half is null or semester_half in (1, 2)
  );

with canonical_seasons as (
  select
    semester_year,
    semester_half,
    min(id::text)::uuid as keep_id
  from public.seasons
  where semester_year is not null
    and semester_half is not null
  group by semester_year, semester_half
  having count(*) > 1
),
duplicate_seasons as (
  select
    seasons.id,
    canonical_seasons.keep_id
  from public.seasons
  join canonical_seasons
    on canonical_seasons.semester_year = seasons.semester_year
   and canonical_seasons.semester_half = seasons.semester_half
  where seasons.id <> canonical_seasons.keep_id
)
update public.matches
set season_id = duplicate_seasons.keep_id
from duplicate_seasons
where matches.season_id = duplicate_seasons.id;

with canonical_seasons as (
  select
    semester_year,
    semester_half,
    min(id::text)::uuid as keep_id
  from public.seasons
  where semester_year is not null
    and semester_half is not null
  group by semester_year, semester_half
  having count(*) > 1
),
duplicate_seasons as (
  select seasons.id
  from public.seasons
  join canonical_seasons
    on canonical_seasons.semester_year = seasons.semester_year
   and canonical_seasons.semester_half = seasons.semester_half
  where seasons.id <> canonical_seasons.keep_id
)
delete from public.seasons
using duplicate_seasons
where seasons.id = duplicate_seasons.id;

create unique index if not exists seasons_semester_unique_idx
  on public.seasons (semester_year, semester_half)
  where semester_year is not null and semester_half is not null;

create or replace function public.semester_bounds(
  p_played_at date,
  out season_name text,
  out starts_at date,
  out ends_at date,
  out semester_year integer,
  out semester_half integer
)
language plpgsql
immutable
set search_path = public
as $$
declare
  v_year integer := extract(year from p_played_at)::integer;
  v_month integer := extract(month from p_played_at)::integer;
begin
  if v_month <= 6 then
    season_name := v_year::text || ' S1';
    starts_at := make_date(v_year, 1, 1);
    ends_at := make_date(v_year, 6, 30);
    semester_half := 1;
  else
    season_name := v_year::text || ' S2';
    starts_at := make_date(v_year, 7, 1);
    ends_at := make_date(v_year, 12, 31);
    semester_half := 2;
  end if;

  semester_year := v_year;
end;
$$;

create or replace function public.season_for_date(
  p_played_at date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bounds record;
  v_season_id uuid;
  v_is_current_semester boolean;
begin
  select *
  into v_bounds
  from public.semester_bounds(p_played_at);

  v_is_current_semester := current_date between v_bounds.starts_at and v_bounds.ends_at;

  if v_is_current_semester then
    update public.seasons
    set active = false
    where active
      and (
        semester_year is distinct from v_bounds.semester_year
        or semester_half is distinct from v_bounds.semester_half
      );
  end if;

  select id
  into v_season_id
  from public.seasons
  where semester_year = v_bounds.semester_year
    and semester_half = v_bounds.semester_half
  limit 1;

  if v_season_id is null then
    insert into public.seasons (
      name,
      starts_at,
      ends_at,
      active,
      semester_year,
      semester_half
    )
    values (
      v_bounds.season_name,
      v_bounds.starts_at,
      v_bounds.ends_at,
      v_is_current_semester,
      v_bounds.semester_year,
      v_bounds.semester_half
    )
    on conflict (semester_year, semester_half)
    where semester_year is not null and semester_half is not null
    do update set
      name = excluded.name,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      active = case when v_is_current_semester then true else public.seasons.active end
    returning id into v_season_id;
  elsif v_is_current_semester then
    update public.seasons
    set active = true,
        ends_at = v_bounds.ends_at
    where id = v_season_id;
  end if;

  return v_season_id;
end;
$$;

create or replace function public.current_season_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.season_for_date(current_date);
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
  v_season_id uuid;
begin
  v_season_id := public.season_for_date(p_played_at);
  perform public.apply_inactivity_decay(p_played_at);

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
    v_season_id,
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

  if not exists (
    select 1
    from public.seasons
    where id = v_season_id
      and active
  ) then
    return v_match;
  end if;

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
      wins = v_wins_after,
      inactivity_penalty = 0,
      last_decay_at = null
    where id = v_player.id;
  end loop;

  return v_match;
end;
$$;

update public.matches
set season_id = public.season_for_date(played_at)
where played_at is not null;

select public.current_season_id();

grant execute on function public.semester_bounds(date) to anon, authenticated;
grant execute on function public.season_for_date(date) to anon, authenticated;
grant execute on function public.current_season_id() to anon, authenticated;
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
