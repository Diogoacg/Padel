-- A two-set win carries more weight than a deciding-set win.
-- Save the full pre-change rating state before replaying both seasons.
do $$
begin
  if to_regclass('padel_internal.rating_snapshots') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'players'
         and column_name = 'inactivity_forfeit'
     ) then
    raise exception 'Apply the Elo long-absence migrations first.';
  end if;
end;
$$;

insert into padel_internal.rating_snapshots (algorithm, players, matches, rating_events)
select
  'elo-straight-140-20260927',
  coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.players p), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.matches m), '[]'::jsonb),
  coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.rating_events e), '[]'::jsonb)
on conflict (algorithm) do nothing;

create or replace function public.rating_margin_multiplier(
  p_winner_side text,
  p_set_1_a integer, p_set_1_b integer,
  p_set_2_a integer, p_set_2_b integer,
  p_set_3_a integer, p_set_3_b integer
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when ($1 = 'a' and $2 > $3 and $4 > $5)
      or ($1 = 'b' and $3 > $2 and $5 > $4) then 1.40
    else 0.90
  end;
$$;

-- rating_events, match deltas, and the live ranking are reconstructed together.
do $$
declare v_season record;
begin
  for v_season in select id from public.seasons order by active, starts_at loop
    perform public.recompute_season_rating_history(v_season.id);
  end loop;
end;
$$;
