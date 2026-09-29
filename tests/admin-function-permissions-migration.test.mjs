import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260929210654_restrict_admin_function_execution.sql",
    import.meta.url,
  ),
  "utf8",
);

const administrativeFunctions = [
  "public.recompute_rating_history()",
  "public.recompute_season_rating_history(uuid)",
  "public.start_new_season(text,date)",
  "public.switch_active_season(uuid)",
  "public.delete_season(uuid)",
];

test("administrative functions are not executable through API roles", async (t) => {
  const db = new PGlite();
  await db.waitReady;
  t.after(() => db.close());

  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create function public.recompute_rating_history() returns void
      language sql security definer as 'select';
    create function public.recompute_season_rating_history(uuid) returns void
      language sql security definer as 'select';
    create function public.start_new_season(text, date default current_date) returns void
      language sql security definer as 'select';
    create function public.switch_active_season(uuid) returns void
      language sql security definer as 'select';
    create function public.delete_season(uuid) returns void
      language sql security definer as 'select';

    grant execute on function public.recompute_rating_history() to anon, authenticated;
    grant execute on function public.recompute_season_rating_history(uuid) to anon, authenticated;
    grant execute on function public.start_new_season(text, date) to anon, authenticated;
    grant execute on function public.switch_active_season(uuid) to anon, authenticated;
    grant execute on function public.delete_season(uuid) to anon, authenticated;
  `);

  await db.exec(migration);

  for (const functionName of administrativeFunctions) {
    const { rows } = await db.query(
      `select
        has_function_privilege('anon', $1, 'EXECUTE') as anon,
        has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated,
        has_function_privilege('service_role', $1, 'EXECUTE') as service_role`,
      [functionName],
    );
    assert.deepEqual(
      rows[0],
      { anon: false, authenticated: false, service_role: true },
      functionName,
    );
  }
});

test("the migration does not change a public application RPC", async (t) => {
  const db = new PGlite();
  await db.waitReady;
  t.after(() => db.close());

  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create function public.register_match() returns void
      language sql security definer as 'select';
    create function public.recompute_rating_history() returns void
      language sql security definer as 'select';
    create function public.recompute_season_rating_history(uuid) returns void
      language sql security definer as 'select';
    create function public.start_new_season(text, date default current_date) returns void
      language sql security definer as 'select';
    create function public.switch_active_season(uuid) returns void
      language sql security definer as 'select';
    create function public.delete_season(uuid) returns void
      language sql security definer as 'select';
  `);

  await db.exec(migration);

  const { rows } = await db.query(
    `select
      has_function_privilege('anon', 'public.register_match()', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.register_match()', 'EXECUTE') as authenticated`,
  );
  assert.deepEqual(rows[0], { anon: true, authenticated: true });
});
