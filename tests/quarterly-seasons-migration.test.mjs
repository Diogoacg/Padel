import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const migrationPath = "../supabase/migrations/20260927_quarterly_seasons.sql";
const quarterlyMigration = readFileSync(new URL(migrationPath, import.meta.url), "utf8");
const replayMigration = readFileSync(
  new URL("../supabase/migrations/20260927_elo_activity_replay.sql", import.meta.url), "utf8",
);
const graceMigration = readFileSync(
  new URL("../supabase/migrations/20260927_elo_activity_grace_30_days.sql", import.meta.url), "utf8",
);
const longAbsenceMigration = readFileSync(
  new URL("../supabase/migrations/20260927_elo_long_absence_forfeit.sql", import.meta.url), "utf8",
);
const straightSetsMigration = readFileSync(
  new URL("../supabase/migrations/20260927_elo_straight_sets_140.sql", import.meta.url), "utf8",
);
const replaceMatchMigration = readFileSync(
  new URL("../supabase/migrations/20260527_zzzzzz_replace_match.sql", import.meta.url), "utf8",
);

const players = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005",
];
const firstSemester = "10000000-0000-4000-8000-000000000001";
const secondSemester = "10000000-0000-4000-8000-000000000002";
const matchIds = {
  q1: "20000000-0000-4000-8000-000000000001",
  q2: "20000000-0000-4000-8000-000000000002",
  q3: "20000000-0000-4000-8000-000000000003",
  q4: "20000000-0000-4000-8000-000000000004",
  pending: "20000000-0000-4000-8000-000000000005",
};

async function createDatabase({ brokenLegacyMatch = false } = {}) {
  const db = new PGlite();
  await db.waitReady;
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.players (
      id uuid primary key default gen_random_uuid(),
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
      id uuid primary key default gen_random_uuid(),
      name text not null,
      starts_at date not null,
      ends_at date,
      active boolean not null,
      semester_year integer,
      semester_half integer,
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
    create function public.season_for_date(p_played_at date) returns uuid
    language sql stable set search_path = public as $$
      select id from public.seasons
      where p_played_at >= starts_at and (ends_at is null or p_played_at <= ends_at)
      order by starts_at desc limit 1
    $$;
  `);

  await db.query(`
    insert into public.players (id, name, rating, matches, wins, inactivity_penalty)
    values
      ($1, 'Player 1', 1110, 12, 8, 0),
      ($2, 'Player 2', 980, 9, 4, 0),
      ($3, 'Player 3', 1040, 7, 3, 0),
      ($4, 'Player 4', 970, 5, 2, 0),
      ($5, 'Player 5', 1000, 0, 0, 0)
  `, players);
  await db.query(`
    insert into public.seasons (
      id, name, starts_at, ends_at, active, semester_year, semester_half
    ) values
      ($1, '2025 S1', '2025-01-01', '2025-06-30', false, 2025, 1),
      ($2, '2025 S2', '2025-07-01', '2025-12-31', true, 2025, 2)
  `, [firstSemester, secondSemester]);

  await applyHistoricalEloMigrations(db);

  // These rows represent old matches stored under two semester seasons. Q1 and Q2
  // share the first season; Q3, Q4, and the pending match share the second.
  await db.query(`
    insert into public.matches (
      id, season_id, status, played_at,
      team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2,
      score_a, score_b, set_1_a, set_1_b, set_2_a, set_2_b, set_3_a, set_3_b,
      rating_delta, created_at
    ) values
      ($1, $6, 'completed', '2025-01-15', $7, $8, $9, $10, 2, 0, 6, 3, 6, 4, 0, 0, 0, '2025-01-15'),
      ($2, $6, 'completed', '2025-04-15', $9, $10, $7, $8, 2, 0, 6, 3, 6, 4, 0, 0, 0, '2025-04-15'),
      ($3, $11, 'completed', '2025-07-15', $7, $9, $8, $10, 2, 0, 6, 3, 6, 4, 0, 0, 0, '2025-07-15'),
      ($4, $11, 'completed', '2025-12-15', $7, $12, $8, $10, 2, 0, 6, 3, 6, 4, 0, 0, 0, '2025-12-15'),
      ($5, $11, 'pending',   '2025-09-30', $12, $8, $9, $10, 2, 0, 6, 3, 6, 4, 0, 0, 0, '2025-09-30')
  `, [
    matchIds.q1, matchIds.q2, matchIds.q3, matchIds.q4, matchIds.pending,
    firstSemester, players[0], players[1], players[2], players[3], secondSemester, players[4],
  ]);
  if (brokenLegacyMatch) {
    // Bypass a normal FK by dropping it first, as can happen with old imported data.
    await db.exec("alter table public.matches drop constraint matches_team_a_player_2_fkey");
    await db.query(`
      insert into public.matches (
        id, season_id, status, played_at,
        team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2,
        score_a, score_b, set_1_a, set_1_b, set_2_a, set_2_b, set_3_a, set_3_b
      ) values (
        '20000000-0000-4000-8000-000000000099', $1, 'completed', '2025-02-01',
        $2, '90000000-0000-4000-8000-000000000001', $3, $4,
        2, 0, 6, 3, 6, 4, 0, 0
      )
    `, [firstSemester, players[0], players[2], players[3]]);
  }
  return db;
}

async function applyHistoricalEloMigrations(db) {
  await db.exec("begin");
  try {
    await db.exec(replayMigration);
    await db.exec(graceMigration);
    await db.exec(longAbsenceMigration);
    await db.exec(straightSetsMigration);
    await db.exec(replaceMatchMigration);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

async function applyQuarterMigration(db) {
  await db.exec("begin");
  try {
    await db.exec(quarterlyMigration);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}

async function eventsForSeason(db, seasonId) {
  return (await db.query(`
    select m.id as match_id, m.status, e.player_id, e.rating_before, e.rating_after,
      e.inactivity_penalty, e.inactivity_forfeit, e.matches_before, e.matches_after
    from public.matches m
    left join public.rating_events e on e.match_id = m.id
    where m.season_id = $1
    order by m.played_at, m.id, e.player_id
  `, [seasonId])).rows;
}

test("quarter bounds use calendar boundaries, including every rollover date", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyQuarterMigration(db);

  const { rows } = await db.query(`
    select * from (values
      ('2025-01-01'::date), ('2025-03-31'::date),
      ('2025-04-01'::date), ('2025-06-30'::date),
      ('2025-07-01'::date), ('2025-09-30'::date),
      ('2025-10-01'::date), ('2025-12-31'::date)
    ) as dates(day)
    cross join lateral public.quarter_bounds(day)
    order by day
  `);
  assert.deepEqual(rows.map((row) => [
    row.season_name,
    new Date(row.starts_at).toISOString().slice(0, 10),
    new Date(row.ends_at).toISOString().slice(0, 10),
    row.quarter_year,
    row.quarter_number,
  ]), [
    ["Q1 2025", "2025-01-01", "2025-03-31", 2025, 1],
    ["Q1 2025", "2025-01-01", "2025-03-31", 2025, 1],
    ["Q2 2025", "2025-04-01", "2025-06-30", 2025, 2],
    ["Q2 2025", "2025-04-01", "2025-06-30", 2025, 2],
    ["Q3 2025", "2025-07-01", "2025-09-30", 2025, 3],
    ["Q3 2025", "2025-07-01", "2025-09-30", 2025, 3],
    ["Q4 2025", "2025-10-01", "2025-12-31", 2025, 4],
    ["Q4 2025", "2025-10-01", "2025-12-31", 2025, 4],
  ]);
});

test("migration splits semester matches into quarter seasons and replays each from 1000", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyQuarterMigration(db);

  const { rows: assignments } = await db.query(`
    select m.id, m.status, s.name, s.quarter_year, s.quarter_number
    from public.matches m join public.seasons s on s.id = m.season_id
    order by m.played_at, m.id
  `);
  assert.deepEqual(assignments.map((row) => [row.id, row.status, row.name, row.quarter_year, row.quarter_number]), [
    [matchIds.q1, "completed", "Q1 2025", 2025, 1],
    [matchIds.q2, "completed", "Q2 2025", 2025, 2],
    [matchIds.q3, "completed", "Q3 2025", 2025, 3],
    [matchIds.pending, "pending", "Q3 2025", 2025, 3],
    [matchIds.q4, "completed", "Q4 2025", 2025, 4],
  ]);

  const { rows: eventCounts } = await db.query(`
    select s.quarter_number, count(e.id)::integer as count
    from public.seasons s left join public.matches m on m.season_id = s.id
    left join public.rating_events e on e.match_id = m.id
    where s.quarter_year = 2025
    group by s.quarter_number order by s.quarter_number
  `);
  assert.deepEqual(eventCounts.map((row) => [row.quarter_number, row.count]), [
    [1, 4], [2, 4], [3, 4], [4, 4],
  ], "the pending Q3 row must be classified but excluded from replay");

  const { rows: firstEvents } = await db.query(`
    select e.match_id, e.player_id, e.rating_before, e.matches_before
    from public.rating_events e where e.match_id = any($1::uuid[])
    order by e.match_id, e.player_id
  `, [[matchIds.q1, matchIds.q2, matchIds.q3, matchIds.q4]]);
  for (const id of Object.values(matchIds).filter((id) => id !== matchIds.pending)) {
    const matchEvents = firstEvents.filter((event) => event.match_id === id);
    assert.equal(matchEvents.length, 4);
    assert.ok(matchEvents.every((event) => event.rating_before === 1000 && event.matches_before === 0),
      `each player must start at 1000 in match ${id}'s quarter`);
  }

  const { rows: pendingEvents } = await db.query(
    "select count(*)::integer as count from public.rating_events where match_id = $1",
    [matchIds.pending],
  );
  assert.equal(pendingEvents[0].count, 0);
});

test("first match late in a quarter does not charge inactivity before that quarter's first game", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyQuarterMigration(db);

  const { rows: event } = await db.query(`
    select rating_before, rating_after, inactivity_forfeit
    from public.rating_events where match_id = $1 and player_id = $2
  `, [matchIds.q4, players[4]]);
  assert.equal(event[0].rating_before, 1000);
  assert.equal(event[0].inactivity_forfeit, 0);
  assert.ok(event[0].rating_after > 1000);
  const { rows: standings } = await db.query(`
    select rating, matches, wins from public.season_player_standings(
      (select id from public.seasons where quarter_year = 2025 and quarter_number = 4)
    ) where player_id = $1
  `, [players[4]]);
  assert.deepEqual(standings[0], { rating: 1000 + event[0].rating_after - event[0].rating_before, matches: 1, wins: 1 });
  const { rows: inactivePlayer } = await db.query(`
    select rating, matches, wins from public.season_player_standings(
      (select id from public.seasons where quarter_year = 2025 and quarter_number = 4)
    ) where player_id = $1
  `, [players[2]]);
  assert.deepEqual(inactivePlayer[0], { rating: 1000, matches: 0, wins: 0 });
});

test("correcting a match into another quarter replays both affected quarters independently", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyQuarterMigration(db);
  const { rows: unaffectedBefore } = await db.query(`
    select match_id, player_id, rating_before, rating_after, matches_after
    from public.rating_events where match_id in ($1, $2) order by match_id, player_id
  `, [matchIds.q3, matchIds.q4]);

  const { rows: replaced } = await db.query(`
    select (public.replace_match(
      $1, '2025-03-31', $2, $3, $4, $5, 2, 0, 6, 3, 6, 4, 0, 0, 999
    )).id as id
  `, [matchIds.q2, players[0], players[1], players[2], players[3]]);
  const correctedId = replaced[0].id;
  const { rows: correctedSeason } = await db.query(`
    select s.quarter_number from public.matches m
    join public.seasons s on s.id = m.season_id where m.id = $1
  `, [correctedId]);
  assert.equal(correctedSeason[0].quarter_number, 1);

  const { rows: unaffectedAfter } = await db.query(`
    select match_id, player_id, rating_before, rating_after, matches_after
    from public.rating_events where match_id in ($1, $2) order by match_id, player_id
  `, [matchIds.q3, matchIds.q4]);
  assert.deepEqual(unaffectedAfter, unaffectedBefore,
    "later quarter histories must be unchanged when an earlier match moves between quarters");
  const { rows: q2Events } = await db.query(
    "select count(*)::integer as count from public.rating_events e join public.matches m on m.id = e.match_id where m.season_id = (select id from public.seasons where quarter_year = 2025 and quarter_number = 2)",
  );
  assert.equal(q2Events[0].count, 0);
  const { rows: quarterOneEvents } = await db.query(`
    select e.match_id, e.player_id, e.rating_before, e.rating_after, e.inactivity_forfeit, e.matches_before
    from public.rating_events e join public.matches m on m.id = e.match_id
    join public.seasons s on s.id = m.season_id
    where s.quarter_year = 2025 and s.quarter_number = 1
    order by m.played_at, m.created_at, m.id, e.player_id
  `);
  assert.equal(quarterOneEvents.length, 8);
  const firstQuarterEvents = quarterOneEvents.filter((event) => event.match_id === matchIds.q1);
  const movedEvents = quarterOneEvents.filter((event) => event.match_id === correctedId);
  assert.equal(movedEvents.length, 4);
  assert.ok(movedEvents.every((event) => event.matches_before === 1),
    "the corrected game must replay after the original Q1 game");
  for (const moved of movedEvents) {
    const previous = firstQuarterEvents.find((event) => event.player_id === moved.player_id);
    assert.equal(moved.rating_before, previous.rating_after - moved.inactivity_forfeit,
      "corrected quarter events must continue from the previous Q1 event after any return forfeit");
  }
});

test("quarter migration is idempotent and a failed replay rolls back its snapshot and DDL", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await applyQuarterMigration(db);
  const firstPlayers = (await db.query(
    "select id, rating, base_rating, matches, wins, inactivity_penalty, inactivity_forfeit from public.players order by id",
  )).rows;
  const firstEvents = (await db.query(
    "select match_id, player_id, rating_before, rating_after, matches_before, matches_after from public.rating_events order by match_id, player_id",
  )).rows;
  await applyQuarterMigration(db);
  assert.deepEqual((await db.query(
    "select id, rating, base_rating, matches, wins, inactivity_penalty, inactivity_forfeit from public.players order by id",
  )).rows, firstPlayers);
  assert.deepEqual((await db.query(
    "select match_id, player_id, rating_before, rating_after, matches_before, matches_after from public.rating_events order by match_id, player_id",
  )).rows, firstEvents);
  const { rows: snapshotCount } = await db.query(
    "select count(*)::integer as count, jsonb_array_length(seasons) as old_seasons from padel_internal.rating_snapshots where algorithm = 'elo-quarterly-20260927' group by seasons",
  );
  assert.equal(snapshotCount[0].count, 1);
  assert.equal(snapshotCount[0].old_seasons, 2);
  const broken = await createDatabase({ brokenLegacyMatch: true });
  t.after(() => broken.close());
  await assert.rejects(applyQuarterMigration(broken), /jogadores inválidos/i);
  const { rows: columns } = await broken.query(`
    select count(*)::integer as count from information_schema.columns
    where table_schema = 'public' and table_name = 'seasons' and column_name = 'quarter_year'
  `);
  const { rows: snapshots } = await broken.query(`
    select count(*)::integer as count from padel_internal.rating_snapshots
    where algorithm = 'elo-quarterly-20260927'
  `);
  const { rows: assignment } = await broken.query(
    "select season_id from public.matches where id = $1", [matchIds.q1],
  );
  assert.equal(columns[0].count, 0);
  assert.equal(snapshots[0].count, 0);
  assert.equal(assignment[0].season_id, firstSemester);
});
