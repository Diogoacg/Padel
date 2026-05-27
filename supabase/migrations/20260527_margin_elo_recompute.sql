create or replace function public.rating_margin_multiplier(
  p_winner_side text,
  p_set_1_a integer,
  p_set_1_b integer,
  p_set_2_a integer,
  p_set_2_b integer,
  p_set_3_a integer,
  p_set_3_b integer
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  v_sets integer[][] := array[
    array[p_set_1_a, p_set_1_b],
    array[p_set_2_a, p_set_2_b],
    array[p_set_3_a, p_set_3_b]
  ];
  v_set integer[];
  v_played_sets integer := 0;
  v_winner_sets integer := 0;
  v_loser_sets integer;
  v_winner_games integer;
  v_loser_games integer;
  v_gap integer;
  v_multiplier numeric;
begin
  foreach v_set slice 1 in array v_sets loop
    if v_played_sets < 2 or (v_set[1] + v_set[2]) > 0 then
      v_played_sets := v_played_sets + 1;

      if (
        (p_winner_side = 'a' and v_set[1] > v_set[2]) or
        (p_winner_side = 'b' and v_set[2] > v_set[1])
      ) then
        v_winner_sets := v_winner_sets + 1;
      end if;
    end if;
  end loop;

  v_loser_sets := v_played_sets - v_winner_sets;
  v_multiplier := case when v_winner_sets = 2 and v_loser_sets = 0 then 1 else 0.85 end;

  foreach v_set slice 1 in array v_sets loop
    if (
      (p_winner_side = 'a' and v_set[1] > v_set[2]) or
      (p_winner_side = 'b' and v_set[2] > v_set[1])
    ) then
      v_winner_games := case when p_winner_side = 'a' then v_set[1] else v_set[2] end;
      v_loser_games := case when p_winner_side = 'a' then v_set[2] else v_set[1] end;
      v_gap := v_winner_games - v_loser_games;

      if v_gap >= 4 then
        v_multiplier := v_multiplier + 0.05;
      end if;

      if v_loser_games = 0 then
        v_multiplier := v_multiplier + 0.1;
      end if;
    end if;
  end loop;

  return least(1.3, v_multiplier);
end;
$$;

create or replace function public.calculate_team_elo_delta(
  p_winner_average numeric,
  p_loser_average numeric,
  p_winner_side text,
  p_set_1_a integer,
  p_set_1_b integer,
  p_set_2_a integer,
  p_set_2_b integer,
  p_set_3_a integer,
  p_set_3_b integer
)
returns integer
language sql
immutable
set search_path = public
as $$
  select greatest(
    1,
    round(
      24 *
      (1 - (1 / (1 + power(10, (($2 - $1) / 400))))) *
      public.rating_margin_multiplier($3, $4, $5, $6, $7, $8, $9)
    )::integer
  );
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

create or replace function public.recompute_rating_history()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
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
  lock table public.players in exclusive mode;
  lock table public.matches in exclusive mode;
  lock table public.rating_events in exclusive mode;

  delete from public.rating_events;

  update public.players
  set rating = 1000,
      matches = 0,
      wins = 0
  where true;

  for v_match in
    select *
    from public.matches
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
end;
$$;

select public.recompute_rating_history();
