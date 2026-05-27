create table if not exists public.rating_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  rating_before integer not null,
  rating_after integer not null,
  matches_before integer not null,
  matches_after integer not null,
  wins_before integer not null,
  wins_after integer not null,
  created_at timestamptz not null default now()
);

create index if not exists rating_events_match_id_idx
  on public.rating_events (match_id);

create index if not exists rating_events_player_id_idx
  on public.rating_events (player_id);

alter table public.rating_events enable row level security;

drop policy if exists "Public rating events read" on public.rating_events;

create policy "Public rating events read"
  on public.rating_events for select
  to anon, authenticated
  using (true);

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
  elsif p_score_b > p_score_a then
    v_winners := array[p_team_b_player_1, p_team_b_player_2];
    v_losers := array[p_team_a_player_1, p_team_a_player_2];
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
    p_rating_delta
  )
  returning * into v_match;

  for v_player in
    select *
    from public.players
    where id = any(v_player_ids)
  loop
    if v_player.id = any(v_winners) then
      v_rating_after := v_player.rating + p_rating_delta;
      v_matches_after := v_player.matches + 1;
      v_wins_after := v_player.wins + 1;
    else
      v_rating_after := greatest(0, v_player.rating - p_rating_delta);
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

  delete from public.matches
  where id = p_match_id;

  return p_match_id;
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

grant execute on function public.delete_match(uuid) to anon, authenticated;
