create or replace function public.delete_match(
  p_match_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_event public.rating_events;
  v_has_events boolean;
  v_is_active_season boolean;
  v_winners uuid[];
  v_losers uuid[];
begin
  select *
  into v_match
  from public.matches
  where id = p_match_id
  for update;

  if v_match.id is null then
    raise exception 'Jogo nao encontrado.';
  end if;

  v_is_active_season := exists (
    select 1
    from public.seasons
    where id = v_match.season_id
      and active
  );

  if v_is_active_season then
    perform 1
    from public.players
    where id in (
      v_match.team_a_player_1,
      v_match.team_a_player_2,
      v_match.team_b_player_1,
      v_match.team_b_player_2
    )
    for update;

    v_has_events := exists (
      select 1
      from public.rating_events
      where match_id = p_match_id
    );

    for v_event in
      select *
      from public.rating_events
      where match_id = p_match_id
    loop
      update public.players
      set
        rating = v_event.rating_before,
        matches = v_event.matches_before,
        wins = v_event.wins_before
      where id = v_event.player_id;
    end loop;

    if not v_has_events then
      if v_match.score_a > v_match.score_b then
        v_winners := array[v_match.team_a_player_1, v_match.team_a_player_2];
        v_losers := array[v_match.team_b_player_1, v_match.team_b_player_2];
      else
        v_winners := array[v_match.team_b_player_1, v_match.team_b_player_2];
        v_losers := array[v_match.team_a_player_1, v_match.team_a_player_2];
      end if;

      update public.players
      set
        rating = greatest(0, rating - v_match.rating_delta),
        matches = greatest(0, matches - 1),
        wins = greatest(0, wins - 1)
      where id = any(v_winners);

      update public.players
      set
        rating = rating + v_match.rating_delta,
        matches = greatest(0, matches - 1)
      where id = any(v_losers);
    end if;
  end if;

  delete from public.matches
  where id = p_match_id;

  return p_match_id;
end;
$$;

grant execute on function public.delete_match(uuid) to anon, authenticated;

create or replace function public.season_player_standings(
  p_season_id uuid
)
returns table (
  player_id uuid,
  name text,
  rating integer,
  matches integer,
  wins integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match public.matches;
  v_player_ids uuid[];
  v_winners uuid[];
  v_losers uuid[];
  v_winner_side text;
  v_winner_average numeric;
  v_loser_average numeric;
  v_rating_delta integer;
begin
  if not exists (
    select 1
    from public.seasons
    where id = p_season_id
  ) then
    raise exception 'Epoca nao encontrada.';
  end if;

  drop table if exists pg_temp.season_standings;

  create temp table season_standings (
    standing_player_id uuid primary key,
    standing_name text not null,
    standing_rating integer not null,
    standing_matches integer not null,
    standing_wins integer not null
  ) on commit drop;

  insert into pg_temp.season_standings (
    standing_player_id,
    standing_name,
    standing_rating,
    standing_matches,
    standing_wins
  )
  select
    players.id,
    players.name,
    1000,
    0,
    0
  from public.players;

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

    select avg(standing_rating)
    into v_winner_average
    from pg_temp.season_standings
    where standing_player_id = any(v_winners);

    select avg(standing_rating)
    into v_loser_average
    from pg_temp.season_standings
    where standing_player_id = any(v_losers);

    if (
      select count(*)
      from pg_temp.season_standings
      where standing_player_id = any(v_player_ids)
    ) = 4 then
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

      update pg_temp.season_standings
      set
        standing_rating = standing_rating + v_rating_delta,
        standing_matches = standing_matches + 1,
        standing_wins = standing_wins + 1
      where standing_player_id = any(v_winners);

      update pg_temp.season_standings
      set
        standing_rating = greatest(0, standing_rating - v_rating_delta),
        standing_matches = standing_matches + 1
      where standing_player_id = any(v_losers);
    end if;
  end loop;

  return query
  select
    standings.standing_player_id,
    standings.standing_name,
    standings.standing_rating,
    standings.standing_matches,
    standings.standing_wins
  from pg_temp.season_standings as standings
  order by
    standings.standing_rating desc,
    standings.standing_wins desc,
    standings.standing_name asc;
end;
$$;

grant execute on function public.season_player_standings(uuid) to anon, authenticated;
