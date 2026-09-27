import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  new URL("../supabase/migrations/20260927_elo_activity_replay.sql", import.meta.url),
  "utf8",
);

const graceMigration = readFileSync(
  new URL("../supabase/migrations/20260927_elo_activity_grace_30_days.sql", import.meta.url),
  "utf8",
);
const longAbsenceMigration = readFileSync(
  new URL("../supabase/migrations/20260927_elo_long_absence_forfeit.sql", import.meta.url),
  "utf8",
);
const straightSetsMigration = readFileSync(
  new URL("../supabase/migrations/20260927_elo_straight_sets_140.sql", import.meta.url),
  "utf8",
);

const ids = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
];
const seasonId = "10000000-0000-4000-8000-000000000001";
const firstMatchId = "20000000-0000-4000-8000-000000000001";
const secondMatchId = "20000000-0000-4000-8000-000000000002";
const pendingMatchId = "20000000-0000-4000-8000-000000000003";

async function createDatabase({ invalidMatch = false, longAbsence = false } = {}) {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.players (
      id uuid primary key,
      name text not null,
      rating integer not null default 1000 check (rating >= 0),
      matches integer not null default 0,
      wins integer not null default 0,
      inactivity_penalty integer not null default 0,
      last_decay_at date,
      created_at timestamptz not null default now(),
      constraint players_inactivity_penalty_valid check (inactivity_penalty between 0 and 60)
    );
    create table public.seasons (
      id uuid primary key,
      name text not null,
      starts_at date not null,
      ends_at date,
      active boolean not null,
      created_at timestamptz not null default now()
    );
    create table public.matches (
      id uuid primary key default gen_random_uuid(),
      season_id uuid references public.seasons(id),
      status text not null default 'completed',
      played_at date not null,
      team_a_player_1 uuid references public.players(id),
      team_a_player_2 uuid references public.players(id),
      team_b_player_1 uuid references public.players(id),
      team_b_player_2 uuid references public.players(id),
      score_a integer not null,
      score_b integer not null,
      set_1_a integer not null,
      set_1_b integer not null,
      set_2_a integer not null,
      set_2_b integer not null,
      set_3_a integer not null,
      set_3_b integer not null,
      rating_delta integer not null default 0,
      created_at timestamptz not null default now()
    );
    create table public.rating_events (
      id uuid primary key default gen_random_uuid(),
      match_id uuid references public.matches(id) on delete cascade,
      player_id uuid references public.players(id),
      rating_before integer not null,
      rating_after integer not null,
      matches_before integer not null,
      matches_after integer not null,
      wins_before integer not null,
      wins_after integer not null,
      created_at timestamptz not null default now()
    );
    create function public.season_for_date(p_date date) returns uuid
    language sql stable set search_path = public as $$
      select id from public.seasons
      where p_date >= starts_at and (ends_at is null or p_date <= ends_at)
      order by starts_at desc limit 1
    $$;
  `);

  await db.query(`
    insert into public.players (id, name, rating, matches, wins, inactivity_penalty)
    values
      ($1, 'Player 1', 1017, 9, 6, 17),
      ($2, 'Player 2', 990, 8, 4, 10),
      ($3, 'Player 3', 1002, 7, 3, 2),
      ($4, 'Player 4', 995, 6, 2, 5),
      ($5, 'Player 5', 1000, 0, 0, 0)
  `, ids);
  await db.query(
    "insert into public.seasons (id, name, starts_at, active) values ($1, 'Current', current_date - 21, true)",
    [seasonId],
  );
  if (longAbsence) {
    await db.query("update public.seasons set starts_at = current_date - 100 where id = $1", [seasonId]);
    await db.query(`
      insert into public.matches (
        id, season_id, status, played_at,
        team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2,
        score_a, score_b, set_1_a, set_1_b, set_2_a, set_2_b, set_3_a, set_3_b,
        rating_delta, created_at
      ) values (
        '20000000-0000-4000-8000-000000000004', $1, 'completed', current_date - 100,
        $2, $3, $4, $5, 2, 0, 6, 3, 6, 4, 0, 0, 0, current_timestamp - interval '3 days'
      )
    `, [seasonId, ids[4], ids[0], ids[1], ids[2]]);
  }

  // The old state has a completed win, a later reversal, and a pending row
  // whose date must not count as activity or enter the replay.
  await db.query(`
    insert into public.matches (
      id, season_id, status, played_at,
      team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2,
      score_a, score_b, set_1_a, set_1_b, set_2_a, set_2_b, set_3_a, set_3_b,
      rating_delta, created_at
    ) values
      ($1, $4, 'completed', current_date - 14, $5, $6, $7, $8, 2, 0, 6, 3, 6, 4, 0, 0, 0, current_timestamp - interval '2 days'),
      ($2, $4, 'completed', current_date - 7, $7, $8, $5, $6, 2, 1, 4, 6, 6, 3, 6, 4, 0, current_timestamp - interval '1 day'),
      ($3, $4, 'pending', current_date, $5, $6, $9, $8, 2, 0, 6, 3, 6, 4, 0, 0, 0, current_timestamp)
  `, [firstMatchId, secondMatchId, pendingMatchId, seasonId, ids[0], ids[1], ids[2], ids[3], ids[4]]);
  if (invalidMatch) {
    // Simulate legacy corrupt data that bypassed the normal distinct-player constraint.
    await db.query(
      `insert into public.matches (
        id, season_id, status, played_at,
        team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2,
        score_a, score_b, set_1_a, set_1_b, set_2_a, set_2_b, set_3_a, set_3_b
      ) values ('20000000-0000-4000-8000-000000000099', $1, 'completed', current_date,
        $2, $2, $3, $4, 2, 0, 6, 3, 6, 4, 0, 0)`,
      [seasonId, ids[0], ids[2], ids[3]],
    );
  }
  // Retain one legacy event so the private snapshot can be checked.
  await db.query(`
    insert into public.rating_events (
      match_id, player_id, rating_before, rating_after,
      matches_before, matches_after, wins_before, wins_after
    ) values ($1, $2, 1000, 1017, 8, 9, 5, 6)
  `, [firstMatchId, ids[0]]);
  return db;
}

async function applyMigration(db) {
  await db.exec("begin");
  try {
    await db.exec(migration);
    await db.exec(graceMigration);
    await db.exec(longAbsenceMigration);
    await db.exec(straightSetsMigration);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

async function readPlayers(db) {
  return (await db.query(
    "select id, rating, base_rating, matches, wins, inactivity_penalty, inactivity_forfeit from public.players order by id",
  )).rows;
}

async function matchEvents(db) {
  return (await db.query(`
    select m.id as match_id, e.player_id, e.rating_before, e.rating_after, e.inactivity_forfeit,
      e.matches_before, e.matches_after, e.wins_before, e.wins_after
    from public.rating_events e join public.matches m on m.id = e.match_id
    order by m.played_at, m.created_at, m.id, e.player_id
  `)).rows;
}

test("replays completed matches, snapshots the old state, and is idempotent", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyMigration(db);

  const firstPassPlayers = await readPlayers(db);
  const firstPassEvents = await matchEvents(db);
  assert.equal(firstPassEvents.length, 8, "only two completed matches should be replayed");
  const { rows: firstDeltas } = await db.query(
    "select rating_delta from public.matches where id = $1", [firstMatchId],
  );
  assert.equal(firstDeltas[0].rating_delta, 22, "2-0 between equal teams uses K=32 and 1.40");
  const { rows: marginFactors } = await db.query(`
    select public.rating_margin_multiplier('a', 6, 3, 6, 4, 0, 0) as straight_a,
      public.rating_margin_multiplier('b', 3, 6, 4, 6, 0, 0) as straight_b,
      public.rating_margin_multiplier('a', 6, 3, 3, 6, 6, 4) as deciding
  `);
  assert.deepEqual(Object.values(marginFactors[0]).map(Number), [1.4, 1.4, 0.9]);
  assert.deepEqual(firstPassPlayers.map((p) => [p.matches, p.wins]), [
    [2, 1], [2, 1], [2, 1], [2, 1], [0, 0],
  ]);
  assert.equal(firstPassEvents.filter((e) => e.match_id === pendingMatchId).length, 0);
  assert.ok(firstPassEvents.every((e) => e.rating_after >= 0));
  const firstEvents = firstPassEvents.filter((event) => event.match_id === firstMatchId);
  const secondEvents = firstPassEvents.filter((event) => event.match_id === secondMatchId);
  assert.equal(firstEvents.length, 4);
  assert.equal(secondEvents.length, 4);
  assert.ok(firstEvents.filter((event) => [ids[0], ids[1]].includes(event.player_id))
    .every((event) => event.rating_before === 1000 && event.rating_after > 1000));
  assert.ok(firstEvents.filter((event) => [ids[2], ids[3]].includes(event.player_id))
    .every((event) => event.rating_before === 1000 && event.rating_after < 1000));
  for (const event of secondEvents) {
    const previous = firstEvents.find((candidate) => candidate.player_id === event.player_id);
    assert.equal(event.rating_before, previous.rating_after, "replay must carry prior skill into the next match");
  }

  const { rows: snapshot } = await db.query(`
    select algorithm, jsonb_array_length(players) as player_count,
      jsonb_array_length(matches) as match_count,
      jsonb_array_length(rating_events) as event_count,
      players -> 0 ->> 'rating' as first_saved_rating
    from padel_internal.rating_snapshots
  `);
  assert.deepEqual(snapshot, [{
    algorithm: "elo-v2-20260927",
    player_count: 5,
    match_count: 3,
    event_count: 1,
    first_saved_rating: "1017",
  }, {
    algorithm: "elo-long-absence-20260927",
    player_count: 5,
    match_count: 3,
    event_count: 8,
    first_saved_rating: "1002",
  }, {
    algorithm: "elo-straight-140-20260927",
    player_count: 5,
    match_count: 3,
    event_count: 8,
    first_saved_rating: "1002",
  }]);

  await applyMigration(db);
  assert.deepEqual(await readPlayers(db), firstPassPlayers);
  assert.deepEqual(await matchEvents(db), firstPassEvents);
  const { rows: snapshots } = await db.query(
    "select count(*)::integer as count from padel_internal.rating_snapshots",
  );
  assert.equal(snapshots[0].count, 3);
});

test("backdated register_match replays forward and delete_match returns to the baseline", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyMigration(db);
  const beforePlayers = await readPlayers(db);
  const beforeEvents = await matchEvents(db);

  const { rows: inserted } = await db.query(`
    select (public.register_match(
      current_date - 10, $1, $2, $3, $4, 2, 0,
      6, 2, 6, 3, 0, 0, 999
    )).id as id
  `, ids.slice(0, 4));
  const backdatedId = inserted[0].id;
  const { rows: ordered } = await db.query(`
    select id from public.matches where status = 'completed' order by played_at, created_at, id
  `);
  assert.deepEqual(ordered.map((row) => row.id), [firstMatchId, backdatedId, secondMatchId]);

  const { rows: replayed } = await db.query(
    "select rating_delta from public.matches where id = $1",
    [backdatedId],
  );
  assert.notEqual(replayed[0].rating_delta, 999, "client preview delta must not be authoritative");
  const withBackdatedPlayers = await readPlayers(db);
  assert.notDeepEqual(withBackdatedPlayers, beforePlayers);
  const withBackdatedEvents = await matchEvents(db);
  assert.equal(withBackdatedEvents.length, 12);

  await db.query("select public.delete_match($1)", [backdatedId]);
  assert.deepEqual(await readPlayers(db), beforePlayers);
  assert.deepEqual(await matchEvents(db), beforeEvents);
});

test("pending rows do not count as activity; decay has 30-day grace and caps at 200", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyMigration(db);

  const { rows: activity } = await db.query(`
    select public.player_last_played_at($1, $2) = current_date - 7 as played_expected,
      public.player_last_played_at($3, $2) is null as pending_only
  `, [ids[0], seasonId, ids[4]]);
  const { rows: today } = await db.query("select current_date as today, current_date - 21 as season_start");
  assert.equal(activity[0].played_expected, true);
  assert.equal(activity[0].pending_only, true);

  const { rows: decay } = await db.query(`
    select
      public.inactivity_decay_points($1::date, $1::date + 30) as grace_end,
      public.inactivity_decay_points($1::date, $1::date + 31) as first_point,
      public.inactivity_decay_points($1::date, $1::date + 37) as one_week,
      public.inactivity_decay_points($1::date, $1::date + 38) as second_week,
      public.inactivity_decay_points($1::date, $1::date + 80) as cap,
      public.inactivity_decay_points($1::date, $1::date + 200) as capped
  `, [today[0].today]);
  assert.deepEqual(Object.values(decay[0]), [0, 25, 25, 50, 200, 200]);

  await db.query("update public.players set rating = base_rating, inactivity_penalty = 0");
  const { rows: changed } = await db.query(
    "select public.apply_inactivity_decay(current_date + 24) as changed",
  );
  assert.equal(changed[0].changed, 5);
  const { rows: player5 } = await db.query(
    "select rating, base_rating, inactivity_penalty, inactivity_forfeit from public.players where id = $1",
    [ids[4]],
  );
  assert.deepEqual(player5[0], {
    rating: 925, base_rating: 1000, inactivity_penalty: 75, inactivity_forfeit: 0,
  });

  const { rows: played } = await db.query(`
    select * from public.register_match(
      current_date, $1, $2, $3, $4, 2, 0, 6, 3, 6, 4, 0, 0, 999
    )
  `, [ids[4], ids[0], ids[2], ids[3]]);
  const { rows: recovered } = await db.query(
    "select rating, base_rating, inactivity_penalty, inactivity_forfeit from public.players where id = $1",
    [ids[4]],
  );
  assert.equal(played[0].rating_delta > 0, true);
  assert.deepEqual(recovered[0], {
    rating: 1000 + played[0].rating_delta,
    base_rating: 1000 + played[0].rating_delta,
    inactivity_penalty: 0,
    inactivity_forfeit: 0,
  });
});

test("permanent absence forfeit applies only beyond day 60 and caps at half the transient decay", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyMigration(db);

  const { rows } = await db.query(`
    select
      public.inactivity_forfeit_points($1::date, $1::date + 60) as day_60,
      public.inactivity_forfeit_points($1::date, $1::date + 61) as day_61,
      public.inactivity_forfeit_points($1::date, $1::date + 67) as day_67,
      public.inactivity_forfeit_points($1::date, $1::date + 68) as day_68,
      public.inactivity_forfeit_points($1::date, $1::date + 89) as day_89,
      public.inactivity_forfeit_points($1::date, $1::date + 95) as day_95,
      public.inactivity_forfeit_points($1::date, $1::date + 200) as day_200
  `, ["2020-01-01"]);
  assert.deepEqual(Object.values(rows[0]), [0, 13, 15, 30, 100, 100, 100]);
});

test("a returning player permanently loses the forfeit before team Elo and replay is idempotent", async (t) => {
  const db = await createDatabase({ longAbsence: true });
  t.after(() => db.close());
  await applyMigration(db);

  const before = await db.query(
    "select base_rating, rating, inactivity_forfeit from public.players where id = $1",
    [ids[4]],
  );
  assert.equal(before.rows[0].inactivity_forfeit, 0, "a forfeit is charged when the player returns");

  const { rows: backdated } = await db.query(`
    select (public.register_match(
      current_date - 50, $1, $2, $3, $4, 2, 0, 6, 3, 6, 4, 0, 0, 999
    )).id as id
  `, [ids[4], ids[0], ids[1], ids[2]]);
  const { rows: backdatedEvent } = await db.query(`
    select inactivity_forfeit from public.rating_events where match_id = $1 and player_id = $2
  `, [backdated[0].id, ids[4]]);
  assert.equal(backdatedEvent[0].inactivity_forfeit, 0, "a match within 60 days has no permanent loss");
  await db.query("select public.delete_match($1)", [backdated[0].id]);
  assert.deepEqual((await db.query(
    "select base_rating, rating, inactivity_forfeit from public.players where id = $1", [ids[4]],
  )).rows[0], before.rows[0], "deleting a backdated activity restores the no-return baseline");

  const { rows: returned } = await db.query(`
    select * from public.register_match(
      current_date, $1, $2, $3, $4, 2, 0, 6, 3, 6, 4, 0, 0, 999
    )
  `, [ids[4], ids[0], ids[1], ids[2]]);
  const returnId = returned[0].id;
  const { rows: event } = await db.query(`
    select rating_before, rating_after, inactivity_forfeit
    from public.rating_events where match_id = $1 and player_id = $2
  `, [returnId, ids[4]]);
  const { rows: player } = await db.query(
    "select rating, base_rating, inactivity_penalty, inactivity_forfeit from public.players where id = $1",
    [ids[4]],
  );
  assert.equal(event[0].inactivity_forfeit, 100);
  assert.equal(event[0].rating_before, before.rows[0].base_rating - 100);
  assert.equal(event[0].rating_after > event[0].rating_before, true);
  assert.equal(player[0].inactivity_forfeit, 100);
  assert.equal(player[0].base_rating, event[0].rating_after);
  assert.equal(player[0].rating, player[0].base_rating);
  assert.equal(player[0].inactivity_penalty, 0);

  const { rows: repeated } = await db.query(`
    select * from public.register_match(
      current_date, $1, $2, $3, $4, 2, 0, 6, 3, 6, 4, 0, 0, 999
    )
  `, [ids[4], ids[0], ids[1], ids[2]]);
  const { rows: secondEvent } = await db.query(`
    select inactivity_forfeit from public.rating_events where match_id = $1 and player_id = $2
  `, [repeated[0].id, ids[4]]);
  assert.equal(secondEvent[0].inactivity_forfeit, 0, "the same absence must not be charged twice");
  const { rows: accumulated } = await db.query(
    "select inactivity_forfeit from public.players where id = $1", [ids[4]],
  );
  assert.equal(accumulated[0].inactivity_forfeit, 100);

  await db.query("update public.seasons set active = false, ends_at = current_date where id = $1", [seasonId]);
  const { rows: archived } = await db.query(
    "select rating from public.season_player_standings($1) where player_id = $2",
    [seasonId, ids[4]],
  );
  assert.equal(archived[0].rating, (await db.query(
    "select base_rating from public.players where id = $1", [ids[4]],
  )).rows[0].base_rating);

  const firstPlayers = await readPlayers(db);
  const firstEvents = await matchEvents(db);
  await applyMigration(db);
  assert.deepEqual(await readPlayers(db), firstPlayers);
  assert.deepEqual(await matchEvents(db), firstEvents);
});

test("invalid legacy replay aborts the migration without leaving partial DDL or data", async (t) => {
  const db = await createDatabase({ invalidMatch: true });
  t.after(() => db.close());
  await assert.rejects(applyMigration(db), /jogadores inválidos/i);

  const { rows: columns } = await db.query(`
    select count(*)::integer as count from information_schema.columns
    where table_schema = 'public' and table_name = 'players' and column_name = 'base_rating'
  `);
  const { rows: snapshots } = await db.query(
    "select to_regclass('padel_internal.rating_snapshots') as table_name",
  );
  const { rows: player } = await db.query(
    "select rating, matches, wins, inactivity_penalty from public.players where id = $1",
    [ids[0]],
  );
  assert.equal(columns[0].count, 0);
  assert.equal(snapshots[0].table_name, null);
  assert.deepEqual(player[0], { rating: 1017, matches: 9, wins: 6, inactivity_penalty: 17 });
});

test("register_match rejects invalid inputs without adding a match or changing ratings", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyMigration(db);
  const baseline = await readPlayers(db);
  const { rows: counts } = await db.query(
    "select count(*)::integer as matches from public.matches",
  );

  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const call = (date, players, scoreA = 2, scoreB = 0) => db.query(`
    select public.register_match(
      $1::date, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7,
      6, 3, 6, 4, 0, 0, 24
    )
  `, [date, ...players, scoreA, scoreB]);
  await assert.rejects(call(tomorrow, ids.slice(0, 4)), /future|futuro/i);
  await assert.rejects(call(today, [ids[0], ids[0], ids[2], ids[3]]), /diferentes/i);
  await assert.rejects(call(today, ids.slice(0, 4), 1, 1), /vencedor/i);
  await assert.rejects(call(today, [ids[0], ids[1], ids[2], "90000000-0000-4000-8000-000000000001"]), /nao existe/i);

  const { rows: afterCounts } = await db.query(
    "select count(*)::integer as matches from public.matches",
  );
  assert.equal(afterCounts[0].matches, counts[0].matches);
  assert.deepEqual(await readPlayers(db), baseline);
});
