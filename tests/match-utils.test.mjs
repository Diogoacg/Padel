import test from "node:test";
import assert from "node:assert/strict";
import { calculateMatchScore, ratingDelta } from "../lib/match-utils.ts";

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
