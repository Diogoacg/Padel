import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerInsights,
  completedPlayerMatches,
  playerWonMatch,
  recentWins,
  setsLabel,
  teamLabel,
} from "../lib/player-profile-utils.ts";

const players = [
  { id: "p1", name: "Diogo" },
  { id: "p2", name: "Parceiro" },
  { id: "p3", name: "Adversário A" },
  { id: "p4", name: "Adversário B" },
  { id: "p5", name: "Outro parceiro" },
];

function match({
  id,
  playedAt,
  seasonId = "season-1",
  status = "completed",
  teamA = ["p1", "p2"],
  teamB = ["p3", "p4"],
  scoreA = 2,
  scoreB = 0,
  sets = [{ a: 6, b: 2 }, { a: 6, b: 3 }, { a: 0, b: 0 }],
  ratingDelta = 10,
}) {
  return { id, playedAt, seasonId, status, teamA, teamB, scoreA, scoreB, sets, ratingDelta };
}

test("completed player matches excludes pending, other players, and other seasons", () => {
  const matches = [
    match({ id: "done", playedAt: "2026-09-02T10:00:00Z" }),
    match({ id: "pending", playedAt: "2026-09-03T10:00:00Z", status: "pending" }),
    match({ id: "other-season", playedAt: "2026-09-04T10:00:00Z", seasonId: "season-2" }),
    match({ id: "other-player", playedAt: "2026-09-05T10:00:00Z", teamA: ["p2", "p5"], teamB: ["p3", "p4"] }),
  ];

  assert.deepEqual(completedPlayerMatches(matches, "p1", "season-1").map(({ id }) => id), ["done"]);
  assert.deepEqual(completedPlayerMatches(matches, "p1").map(({ id }) => id), ["other-season", "done"]);
});

test("completed matches order by date and preserve database order on the same day", () => {
  const timestamp = "2026-09-03T10:00:00Z";
  const matches = [
    match({ id: "z", playedAt: timestamp }),
    match({ id: "older", playedAt: "2026-09-02T10:00:00Z" }),
    match({ id: "a", playedAt: timestamp }),
  ];

  assert.deepEqual(completedPlayerMatches(matches, "p1").map(({ id }) => id), ["z", "a", "older"]);
});

test("wins, streak, partner, opponent, rating extremes, and bagels use ordered matches", () => {
  const matches = completedPlayerMatches([
    match({ id: "loss", playedAt: "2026-09-02T10:00:00Z", teamA: ["p1", "p5"], scoreA: 0, scoreB: 2,
      sets: [{ a: 0, b: 6 }, { a: 1, b: 6 }, { a: 0, b: 0 }], ratingDelta: 20 }),
    match({ id: "win-old", playedAt: "2026-09-03T10:00:00Z", teamA: ["p3", "p4"], teamB: ["p1", "p2"],
      scoreA: 0, scoreB: 2, sets: [{ a: 3, b: 6 }, { a: 4, b: 6 }, { a: 0, b: 0 }], ratingDelta: 15 }),
    match({ id: "win-new", playedAt: "2026-09-04T10:00:00Z", ratingDelta: 12,
      sets: [{ a: 6, b: 0 }, { a: 6, b: 2 }, { a: 0, b: 0 }] }),
  ], "p1", "season-1");
  const insights = buildPlayerInsights(matches, "p1", players);

  assert.equal(playerWonMatch(matches[0], "p1"), true);
  assert.equal(recentWins(matches, "p1"), 2);
  assert.deepEqual(insights.bestPartner, { id: "p2", name: "Parceiro", matches: 2, wins: 2 });
  assert.deepEqual(insights.hardestOpponent, { id: "p3", name: "Adversário A", matches: 3, losses: 1 });
  assert.equal(insights.biggestGain.delta, 15);
  assert.equal(insights.biggestLoss.delta, 20);
  assert.equal(insights.bagelsGiven, 1);
  assert.equal(insights.bagelsTaken, 1);
  assert.deepEqual(insights.currentStreak, { label: "Está quente", value: "+2 seguidos", tone: "gain" });
});

test("empty filtered history has neutral insights", () => {
  const matches = completedPlayerMatches([], "p1");
  const insights = buildPlayerInsights(matches, "p1", players);
  assert.equal(recentWins(matches, "p1"), 0);
  assert.equal(insights.bestPartner, undefined);
  assert.equal(insights.hardestOpponent, undefined);
  assert.equal(insights.biggestGain, null);
  assert.equal(insights.biggestLoss, null);
  assert.equal(insights.bagelsGiven, 0);
  assert.equal(insights.bagelsTaken, 0);
  assert.deepEqual(insights.currentStreak, { label: "Sem série", value: "0 jogos", tone: undefined });
});

test("an unbeaten player has no hardest opponent yet", () => {
  const matches = completedPlayerMatches([
    match({ id: "win", playedAt: "2026-09-04T10:00:00Z" }),
  ], "p1");
  assert.equal(buildPlayerInsights(matches, "p1", players).hardestOpponent, undefined);
});

test("completedPlayerMatches does not truncate histories longer than eight", () => {
  const matches = Array.from({ length: 12 }, (_, index) =>
    match({ id: `m${index}`, playedAt: `2026-09-${String(index + 1).padStart(2, "0")}T10:00:00Z` }),
  );
  assert.equal(completedPlayerMatches(matches, "p1").length, 12);
});

test("labels preserve player fallback and omit an unused third set", () => {
  assert.equal(teamLabel(["p1", "unknown"], players), "Diogo / Jogador");
  assert.equal(setsLabel([{ a: 6, b: 4 }, { a: 3, b: 6 }, { a: 0, b: 0 }]), "6-4 / 3-6");
});
