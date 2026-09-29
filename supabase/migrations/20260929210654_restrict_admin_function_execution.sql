-- These maintenance RPCs run with elevated privileges and are not part of the
-- public application surface. PostgreSQL grants EXECUTE to PUBLIC for new
-- functions by default, so revoke both that inherited grant and the explicit
-- API-role grants left by earlier migrations.
revoke execute on function public.recompute_rating_history()
  from public, anon, authenticated;

revoke execute on function public.recompute_season_rating_history(uuid)
  from public, anon, authenticated;

revoke execute on function public.start_new_season(text, date)
  from public, anon, authenticated;

revoke execute on function public.switch_active_season(uuid)
  from public, anon, authenticated;

revoke execute on function public.delete_season(uuid)
  from public, anon, authenticated;

-- Keep a deliberate server-side maintenance path instead of relying on the
-- implicit PUBLIC grant or on ACL state inherited from older installations.
grant execute on function public.recompute_rating_history() to service_role;
grant execute on function public.recompute_season_rating_history(uuid) to service_role;
grant execute on function public.start_new_season(text, date) to service_role;
grant execute on function public.switch_active_season(uuid) to service_role;
grant execute on function public.delete_season(uuid) to service_role;
