-- Elo activity grace: 30 full days since the last completed match.
do $$
begin
  if to_regclass('padel_internal.rating_snapshots') is null
     or not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'players'
         and column_name = 'base_rating'
     ) then
    raise exception 'Elo v2 base and private snapshot must exist before adjusting decay.';
  end if;
end;
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
  select least(200, 25 * ceil(
    greatest(0, $2 - $1 - 30)::numeric / 7
  )::integer);
$$;

do $$
begin
  perform public.apply_inactivity_decay((now() at time zone 'Europe/Lisbon')::date);
end;
$$;