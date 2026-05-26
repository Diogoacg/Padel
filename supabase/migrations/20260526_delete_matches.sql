drop policy if exists "Public matches delete" on public.matches;

create policy "Public matches delete"
  on public.matches for delete
  to anon, authenticated
  using (true);
