create or replace function public.delete_season(
  p_season_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season public.seasons;
  v_current_season_id uuid;
  v_season_count integer;
begin
  select count(*)
  into v_season_count
  from public.seasons;

  if v_season_count <= 1 then
    raise exception 'Nao podes apagar a unica epoca.';
  end if;

  v_current_season_id := public.current_season_id();

  select *
  into v_season
  from public.seasons
  where id = p_season_id;

  if v_season.id is null then
    raise exception 'Epoca nao encontrada.';
  end if;

  if p_season_id = v_current_season_id then
    raise exception 'Nao podes apagar a epoca atual pela data.';
  end if;

  delete from public.seasons
  where id = p_season_id;

  perform public.current_season_id();

  return p_season_id;
end;
$$;

grant execute on function public.delete_season(uuid) to anon, authenticated;
