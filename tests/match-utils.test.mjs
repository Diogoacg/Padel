import test from "node:test";
import assert from "node:assert/strict";
import { averageRating, calculateMatchScore, ratingDelta } from "../lib/match-utils.ts";

const sets = (a, b, c = [0, 0]) => [{ a: a[0], b: a[1] }, { a: b[0], b: b[1] }, { a: c[0], b: c[1] }];

test("match score characterizes 2-0 and 2-1", () => {
  assert.deepEqual(calculateMatchScore(sets([6, 2], [6, 4])), { valid: true, message: "", scoreA: 2, scoreB: 0 });
  assert.deepEqual(calculateMatchScore(sets([6, 2], [3, 6], [6, 4])), { valid: true, message: "", scoreA: 2, scoreB: 1 });
});

test("draws are invalid and a third set after a 2-0 lead is rejected", () => {
  assert.equal(calculateMatchScore(sets([6, 6], [6, 2])).valid, false);
  assert.equal(calculateMatchScore(sets([6, 2], [6, 3], [6, 4])).valid, false);
});

test("rating is symmetric and an upset earns more than a favorite win", () => {
  const evenSets = sets([6, 4], [6, 4]);
  assert.equal(ratingDelta(1000, 1000, evenSets, "a"), ratingDelta(1000, 1000, sets([4, 6], [4, 6]), "b"));
  assert.ok(ratingDelta(1000, 1400, evenSets, "a") > ratingDelta(1400, 1000, evenSets, "a"));
});

test("team averages use base rating, independent of inactivity decay", () => {
  const players = [
    { id: "a1", baseRating: 1200, rating: 1000 },
    { id: "a2", baseRating: 1000, rating: 800 },
    { id: "b1", baseRating: 1300, rating: 1300 },
    { id: "b2", baseRating: 1100, rating: 1100 },
  ];
  assert.equal(averageRating(players, ["a1", "a2"]), 1100);
  assert.equal(averageRating(players, ["b1", "b2"]), 1200);
});

test("Elo uses K=32, with 1.10 for 2-0 and 0.90 for 2-1", () => {
  assert.equal(ratingDelta(1000, 1000, sets([6, 4], [6, 4]), "a"), 18);
  assert.equal(ratingDelta(1000, 1000, sets([6, 4], [3, 6], [6, 4]), "a"), 14);
});

test("upset deltas reflect different team averages and winning margin", () => {
  const straightUpset = ratingDelta(1000, 1400, sets([6, 4], [6, 4]), "a");
  const straightFavorite = ratingDelta(1400, 1000, sets([6, 4], [6, 4]), "a");
  const closeUpset = ratingDelta(1000, 1400, sets([6, 4], [3, 6], [6, 4]), "a");
  assert.equal(straightUpset, 32);
  assert.equal(straightFavorite, 3);
  assert.equal(closeUpset, 26);
});
