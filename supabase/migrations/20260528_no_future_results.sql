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
  if p_played_at > current_date then
    raise exception 'Ainda nao da para meter resultado de um jogo futuro.';
  end if;

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
    rating_delta,
    status
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
    v_rating_delta,
    'completed'
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
