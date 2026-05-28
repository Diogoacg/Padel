create or replace function public.home_dashboard(
  p_season_id uuid default null
)
returns table (
  season_id uuid,
  season_name text,
  total_players integer,
  total_matches integer,
  average_rating integer,
  inactive_players integer,
  top_players jsonb,
  best_duo_label text,
  best_duo_wins integer,
  best_duo_matches integer,
  biggest_upset_label text,
  biggest_upset_gap integer,
  closest_match_label text,
  closest_match_sets text
)
language sql
security definer
set search_path = public
as $$
  with selected_season as (
    select *
    from public.seasons
    where id = coalesce(p_season_id, public.current_season_id())
    limit 1
  ),
  season_matches as (
    select matches.*
    from public.matches
    join selected_season on selected_season.id = matches.season_id
    where matches.status = 'completed'
  ),
  player_totals as (
    select
      count(*)::integer as total_players,
      coalesce(round(avg(rating)), 0)::integer as average_rating,
      count(*) filter (where inactivity_penalty > 0)::integer as inactive_players
    from public.players
  ),
  top_players_cte as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', ranked_players.id,
          'name', ranked_players.name,
          'rating', ranked_players.rating,
          'matches', ranked_players.matches,
          'wins', ranked_players.wins,
          'inactivityPenalty', ranked_players.inactivity_penalty,
          'lastDecayAt', ranked_players.last_decay_at
        )
        order by ranked_players.rating desc, ranked_players.wins desc, ranked_players.name asc
      ),
      '[]'::jsonb
    ) as top_players
    from (
      select *
      from public.players
      order by rating desc, wins desc, name asc
      limit 5
    ) as ranked_players
  ),
  team_rows as (
    select
      least(team_a_player_1, team_a_player_2) as player_1,
      greatest(team_a_player_1, team_a_player_2) as player_2,
      score_a > score_b as won
    from season_matches
    union all
    select
      least(team_b_player_1, team_b_player_2),
      greatest(team_b_player_1, team_b_player_2),
      score_b > score_a
    from season_matches
  ),
  duo_stats as (
    select
      team_rows.player_1,
      team_rows.player_2,
      count(*)::integer as matches,
      count(*) filter (where won)::integer as wins
    from team_rows
    group by team_rows.player_1, team_rows.player_2
  ),
  best_duo as (
    select
      player_1.name || ' / ' || player_2.name as label,
      duo_stats.wins,
      duo_stats.matches
    from duo_stats
    join public.players as player_1 on player_1.id = duo_stats.player_1
    join public.players as player_2 on player_2.id = duo_stats.player_2
    order by duo_stats.wins desc, duo_stats.matches desc, label asc
    limit 1
  ),
  upsets as (
    select
      winner_1.name || ' / ' || winner_2.name as label,
      round(loser_rating.average_rating - winner_rating.average_rating)::integer as gap
    from season_matches
    join public.players as winner_1 on winner_1.id = case when score_a > score_b then team_a_player_1 else team_b_player_1 end
    join public.players as winner_2 on winner_2.id = case when score_a > score_b then team_a_player_2 else team_b_player_2 end
    cross join lateral (
      select avg(players.rating) as average_rating
      from public.players
      where players.id in (
        case when season_matches.score_a > season_matches.score_b then season_matches.team_a_player_1 else season_matches.team_b_player_1 end,
        case when season_matches.score_a > season_matches.score_b then season_matches.team_a_player_2 else season_matches.team_b_player_2 end
      )
    ) as winner_rating
    cross join lateral (
      select avg(players.rating) as average_rating
      from public.players
      where players.id in (
        case when season_matches.score_a > season_matches.score_b then season_matches.team_b_player_1 else season_matches.team_a_player_1 end,
        case when season_matches.score_a > season_matches.score_b then season_matches.team_b_player_2 else season_matches.team_a_player_2 end
      )
    ) as loser_rating
    where loser_rating.average_rating > winner_rating.average_rating
    order by loser_rating.average_rating - winner_rating.average_rating desc
    limit 1
  ),
  closest_matches as (
    select
      player_1.name || ' / ' || player_2.name as label,
      concat_ws(
        ' / ',
        set_1_a::text || '-' || set_1_b::text,
        set_2_a::text || '-' || set_2_b::text,
        case when set_3_a + set_3_b > 0 then set_3_a::text || '-' || set_3_b::text end
      ) as sets,
      abs(set_1_a - set_1_b) +
      abs(set_2_a - set_2_b) +
      case when set_3_a + set_3_b > 0 then abs(set_3_a - set_3_b) else 0 end as gap
    from season_matches
    join public.players as player_1 on player_1.id = season_matches.team_a_player_1
    join public.players as player_2 on player_2.id = season_matches.team_a_player_2
    order by gap asc, season_matches.played_at desc, season_matches.created_at desc
    limit 1
  )
  select
    selected_season.id,
    selected_season.name,
    player_totals.total_players,
    count(season_matches.id)::integer,
    player_totals.average_rating,
    player_totals.inactive_players,
    top_players_cte.top_players,
    best_duo.label,
    coalesce(best_duo.wins, 0),
    coalesce(best_duo.matches, 0),
    upsets.label,
    upsets.gap,
    closest_matches.label,
    closest_matches.sets
  from selected_season
  cross join player_totals
  cross join top_players_cte
  left join season_matches on true
  left join best_duo on true
  left join upsets on true
  left join closest_matches on true
  group by
    selected_season.id,
    selected_season.name,
    player_totals.total_players,
    player_totals.average_rating,
    player_totals.inactive_players,
    top_players_cte.top_players,
    best_duo.label,
    best_duo.wins,
    best_duo.matches,
    upsets.label,
    upsets.gap,
    closest_matches.label,
    closest_matches.sets;
$$;

grant execute on function public.home_dashboard(uuid) to anon, authenticated;
