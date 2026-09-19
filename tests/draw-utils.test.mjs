import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBalancedDraw,
  buildRandomDraw,
  findLastMatchPairing,
  pairingKeyFromIds,
} from "../lib/draw-utils.ts";

const players = [1000, 1001, 1002, 1004].map((rating, i) => ({
  id: `p${i + 1}`,
  name: `Jogador ${i + 1}`,
  rating,
  matches: 0,
  wins: 0,
  inactivityPenalty: 0,
  lastDecayAt: null,
}));

const ids = (draw) => [...draw.teamA, ...draw.teamB].map((player) => player.id).sort();
const matchFor = (teamA, teamB, playedAt, status = "completed") => ({
  id: `${playedAt}-${status}`,
  seasonId: null,
  status,
  playedAt,
  teamA,
  teamB,
  scoreA: 2,
  scoreB: 0,
  sets: [{ a: 6, b: 2 }, { a: 6, b: 3 }, { a: 0, b: 0 }],
  ratingDelta: 10,
});

test("balanced draw uses exact averages and chooses the .5 gap", () => {
  const draw = buildBalancedDraw(players);
  assert.equal(draw.averageA, 1002);
  assert.equal(draw.averageB, 1001.5);
  assert.equal(draw.gap, 0.5);
  assert.deepEqual(ids(draw), ["p1", "p2", "p3", "p4"]);
});

test("draw validation rejects wrong cardinality, duplicate ids, and non-finite ratings", () => {
  assert.throws(() => buildBalancedDraw(players.slice(0, 3)));
  assert.throws(() => buildBalancedDraw([players[0], players[1], players[2], players[0]]));
  assert.throws(() => buildBalancedDraw([...players.slice(0, 3), { ...players[3], rating: Number.NaN }]));
});

test("random draw can select all three pairings", () => {
  const keys = [0, 0.34, 0.67].map((value) => {
    const draw = buildRandomDraw(players, null, () => value);
    assert.deepEqual(ids(draw), ["p1", "p2", "p3", "p4"]);
    return pairingKeyFromIds(
      [draw.teamA[0].id, draw.teamA[1].id],
      [draw.teamB[0].id, draw.teamB[1].id],
    );
  });
  assert.equal(new Set(keys).size, 3);
});

test("random draw excludes the previous pairing regardless of team orientation", () => {
  const previous = pairingKeyFromIds(["p1", "p2"], ["p3", "p4"]);
  const draw = buildRandomDraw(players, pairingKeyFromIds(["p4", "p3"], ["p2", "p1"]), () => 0);
  assert.notEqual(
    pairingKeyFromIds([draw.teamA[0].id, draw.teamA[1].id], [draw.teamB[0].id, draw.teamB[1].id]),
    previous,
  );
});

test("random draw accepts the half-open rng boundaries and rejects invalid values", () => {
  for (const value of [0, 1 - Number.EPSILON]) {
    const draw = buildRandomDraw(players, null, () => value);
    assert.deepEqual(ids(draw), ["p1", "p2", "p3", "p4"]);
  }
  for (const value of [1, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => buildRandomDraw(players, null, () => value));
  }
});

test("last pairing uses latest completed matching quartet and ignores pending or other players", () => {
  const matches = [
    matchFor(["p1", "p3"], ["p2", "p4"], "2026-06-20T10:00:00Z"),
    matchFor(["p1", "p2"], ["p3", "p4"], "2026-07-01T10:00:00Z", "pending"),
    matchFor(["p1", "p4"], ["p2", "p3"], "2026-08-01T10:00:00Z"),
    matchFor(["p1", "p2"], ["p3", "p9"], "2026-09-01T10:00:00Z"),
  ].reverse();
  assert.equal(findLastMatchPairing(matches, ["p4", "p3", "p2", "p1"]), pairingKeyFromIds(["p1", "p4"], ["p2", "p3"]));
  assert.equal(findLastMatchPairing(matches, ["p1", "p2", "p3"]), null);
});
