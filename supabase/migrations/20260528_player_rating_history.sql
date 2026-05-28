create or replace function public.player_rating_history(
  p_player_id uuid,
  p_season_id uuid default null
)
returns table (
  match_id uuid,
  played_at date,
  rating_before integer,
  rating_after integer,
  rating_delta integer,
  won boolean,
  team_label text,
  opponent_label text,
  score_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    matches.id as match_id,
    matches.played_at,
    rating_events.rating_before,
    rating_events.rating_after,
    abs(rating_events.rating_after - rating_events.rating_before)::integer as rating_delta,
    rating_events.wins_after > rating_events.wins_before as won,
    team_player_1.name || ' / ' || team_player_2.name as team_label,
    opponent_player_1.name || ' / ' || opponent_player_2.name as opponent_label,
    matches.score_a::text || ' - ' || matches.score_b::text || ' · ' ||
      concat_ws(
        ' / ',
        matches.set_1_a::text || '-' || matches.set_1_b::text,
        matches.set_2_a::text || '-' || matches.set_2_b::text,
        case
          when matches.set_3_a + matches.set_3_b > 0
          then matches.set_3_a::text || '-' || matches.set_3_b::text
        end
      ) as score_label
  from public.rating_events
  join public.matches on matches.id = rating_events.match_id
  join public.players as team_player_1
    on team_player_1.id = case
      when p_player_id in (matches.team_a_player_1, matches.team_a_player_2)
      then matches.team_a_player_1
      else matches.team_b_player_1
    end
  join public.players as team_player_2
    on team_player_2.id = case
      when p_player_id in (matches.team_a_player_1, matches.team_a_player_2)
      then matches.team_a_player_2
      else matches.team_b_player_2
    end
  join public.players as opponent_player_1
    on opponent_player_1.id = case
      when p_player_id in (matches.team_a_player_1, matches.team_a_player_2)
      then matches.team_b_player_1
      else matches.team_a_player_1
    end
  join public.players as opponent_player_2
    on opponent_player_2.id = case
      when p_player_id in (matches.team_a_player_1, matches.team_a_player_2)
      then matches.team_b_player_2
      else matches.team_a_player_2
    end
  where rating_events.player_id = p_player_id
    and (
      p_season_id is null
      or matches.season_id = p_season_id
    )
  order by matches.played_at asc, matches.created_at asc, matches.id asc;
$$;

grant execute on function public.player_rating_history(uuid, uuid) to anon, authenticated;
