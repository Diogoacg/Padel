alter table public.players
  add column if not exists inactivity_penalty integer not null default 0,
  add column if not exists last_decay_at date;

alter table public.players
  drop constraint if exists players_inactivity_penalty_valid;

alter table public.players
  add constraint players_inactivity_penalty_valid check (
    inactivity_penalty >= 0 and inactivity_penalty <= 60
  );

create index if not exists matches_player_activity_idx
  on public.matches (season_id, played_at desc);

create or replace function public.player_last_played_at(
  p_player_id uuid,
  p_season_id uuid
)
returns date
language sql
stable
set search_path = public
as $$
  select max(played_at)
  from public.matches
  where season_id = p_season_id
    and p_player_id in (
      team_a_player_1,
      team_a_player_2,
      team_b_player_1,
      team_b_player_2
    );
$$;

create or replace function public.inactivity_decay_points(
  p_last_played_at date,
  p_today date default current_date
)
returns integer
language sql
immutable
set search_path = public
as $$
  select least(
    60,
    greatest(0, ((p_today - p_last_played_at - 21) / 7)::integer * 3)
  );
$$;

create or replace function public.apply_inactivity_decay(
  p_today date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
  v_player public.players;
  v_last_played_at date;
  v_target_penalty integer;
  v_extra_penalty integer;
  v_changed integer := 0;
begin
  select *
  into v_season
  from public.seasons
  where active
  order by created_at desc
  limit 1;

  if v_season.id is null then
    return 0;
  end if;

  for v_player in
    select *
    from public.players
    for update
  loop
    v_last_played_at := coalesce(
      public.player_last_played_at(v_player.id, v_season.id),
      v_season.starts_at
    );

    v_target_penalty := public.inactivity_decay_points(v_last_played_at, p_today);
    v_extra_penalty := v_target_penalty - v_player.inactivity_penalty;

    if v_extra_penalty > 0 then
      update public.players
      set
        rating = greatest(0, rating - v_extra_penalty),
        inactivity_penalty = v_target_penalty,
        last_decay_at = p_today
      where id = v_player.id;

      v_changed := v_changed + 1;
    end if;
  end loop;

  return v_changed;
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
      wins = v_wins_after,
      inactivity_penalty = 0,
      last_decay_at = null
    where id = v_player.id;
  end loop;

  return v_match;
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
    wins = 0,
    inactivity_penalty = 0,
    last_decay_at = null
  where true;

  return v_season;
end;
$$;

create or replace function public.recompute_season_rating_history(
  p_season_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
  v_match public.matches;
  v_player public.players;
  v_player_ids uuid[];
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
  select *
  into v_season
  from public.seasons
  where id = p_season_id;

  if v_season.id is null then
    raise exception 'Epoca nao encontrada.';
  end if;

  lock table public.players in exclusive mode;
  lock table public.matches in exclusive mode;
  lock table public.rating_events in exclusive mode;

  delete from public.rating_events
  where match_id in (
    select id
    from public.matches
    where season_id = p_season_id
  );

  update public.players
  set
    rating = 1000,
    matches = 0,
    wins = 0,
    inactivity_penalty = 0,
    last_decay_at = null
  where true;

  for v_match in
    select *
    from public.matches
    where season_id = p_season_id
    order by played_at asc, created_at asc, id asc
  loop
    if v_match.score_a > v_match.score_b then
      v_winners := array[v_match.team_a_player_1, v_match.team_a_player_2];
      v_losers := array[v_match.team_b_player_1, v_match.team_b_player_2];
      v_winner_side := 'a';
    else
      v_winners := array[v_match.team_b_player_1, v_match.team_b_player_2];
      v_losers := array[v_match.team_a_player_1, v_match.team_a_player_2];
      v_winner_side := 'b';
    end if;

    v_player_ids := array[
      v_match.team_a_player_1,
      v_match.team_a_player_2,
      v_match.team_b_player_1,
      v_match.team_b_player_2
    ];

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
      v_match.set_1_a,
      v_match.set_1_b,
      v_match.set_2_a,
      v_match.set_2_b,
      v_match.set_3_a,
      v_match.set_3_b
    );

    update public.matches
    set rating_delta = v_rating_delta
    where id = v_match.id;

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
  end loop;

  perform public.apply_inactivity_decay(current_date);
end;
$$;

create or replace function public.switch_active_season(
  p_season_id uuid
)
returns public.seasons
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
begin
  select *
  into v_season
  from public.seasons
  where id = p_season_id;

  if v_season.id is null then
    raise exception 'Epoca nao encontrada.';
  end if;

  update public.seasons
  set
    active = false,
    ends_at = coalesce(ends_at, greatest(starts_at, current_date - 1))
  where active and id <> p_season_id;

  update public.seasons
  set
    active = true,
    ends_at = null
  where id = p_season_id
  returning * into v_season;

  perform public.recompute_season_rating_history(p_season_id);

  return v_season;
end;
$$;

grant execute on function public.player_last_played_at(uuid, uuid) to anon, authenticated;
grant execute on function public.inactivity_decay_points(date, date) to anon, authenticated;
grant execute on function public.apply_inactivity_decay(date) to anon, authenticated;
grant execute on function public.recompute_season_rating_history(uuid) to anon, authenticated;
grant execute on function public.switch_active_season(uuid) to anon, authenticated;
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
grant execute on function public.start_new_season(text, date) to anon, authenticated;
