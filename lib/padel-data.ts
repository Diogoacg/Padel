import { supabase } from "@/lib/supabase";
import type { MatchRecord, PlayerRecord } from "@/lib/types";

export type Player = {
  id: string;
  name: string;
  rating: number;
  matches: number;
  wins: number;
};

export type Match = {
  id: string;
  playedAt: string;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number;
  scoreB: number;
  sets: [SetScore, SetScore, SetScore];
  ratingDelta: number;
};

export type SetScore = {
  a: number;
  b: number;
};

export type PlayerUpdate = {
  id: string;
  rating: number;
  matches: number;
  wins: number;
};

export const mapPlayer = (record: PlayerRecord): Player => ({
  id: record.id,
  name: record.name,
  rating: record.rating,
  matches: record.matches,
  wins: record.wins
});

export const mapMatch = (record: MatchRecord): Match => ({
  id: record.id,
  playedAt: record.played_at,
  teamA: [record.team_a_player_1, record.team_a_player_2],
  teamB: [record.team_b_player_1, record.team_b_player_2],
  scoreA: record.score_a,
  scoreB: record.score_b,
  sets: [
    { a: record.set_1_a, b: record.set_1_b },
    { a: record.set_2_a, b: record.set_2_b },
    { a: record.set_3_a, b: record.set_3_b }
  ],
  ratingDelta: record.rating_delta
});

const matchSelect =
  "id, played_at, team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2, score_a, score_b, set_1_a, set_1_b, set_2_a, set_2_b, set_3_a, set_3_b, rating_delta, created_at";

export async function getPlayers() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("players")
    .select("id, name, rating, matches, wins, created_at")
    .order("rating", { ascending: false })
    .returns<PlayerRecord[]>();

  if (error) throw new Error(error.message);
  return data.map(mapPlayer);
}

export async function getPlayer(id: string) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("players")
    .select("id, name, rating, matches, wins, created_at")
    .eq("id", id)
    .single<PlayerRecord>();

  if (error) throw new Error(error.message);
  return mapPlayer(data);
}

export async function getMatches() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("matches")
    .select(matchSelect)
    .order("played_at", { ascending: false })
    .order("created_at", { ascending: false })
    .returns<MatchRecord[]>();

  if (error) throw new Error(error.message);
  return data.map(mapMatch);
}

export async function getMatch(id: string) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("matches")
    .select(matchSelect)
    .eq("id", id)
    .single<MatchRecord>();

  if (error) throw new Error(error.message);
  return mapMatch(data);
}

export async function createPlayer(name: string) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .from("players")
    .insert({ name })
    .select("id, name, rating, matches, wins, created_at")
    .single<PlayerRecord>();

  if (error) throw new Error(error.message);
  return mapPlayer(data);
}

export async function createMatch(match: Omit<Match, "id">) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .from("matches")
    .insert({
      played_at: match.playedAt,
      team_a_player_1: match.teamA[0],
      team_a_player_2: match.teamA[1],
      team_b_player_1: match.teamB[0],
      team_b_player_2: match.teamB[1],
      score_a: match.scoreA,
      score_b: match.scoreB,
      set_1_a: match.sets[0].a,
      set_1_b: match.sets[0].b,
      set_2_a: match.sets[1].a,
      set_2_b: match.sets[1].b,
      set_3_a: match.sets[2].a,
      set_3_b: match.sets[2].b,
      rating_delta: match.ratingDelta
    })
    .select(matchSelect)
    .single<MatchRecord>();

  if (error) throw new Error(error.message);
  return mapMatch(data);
}

export async function deleteMatch(id: string) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .from("matches")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw new Error(error.message);
  if (!data?.length) {
    throw new Error(
      "O Supabase nao apagou o jogo. Confirma se a policy de delete foi corrida."
    );
  }
}

export async function updatePlayers(updates: PlayerUpdate[]) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");
  const client = supabase;

  const results = await Promise.all(
    updates.map((player) =>
      client
        .from("players")
        .update({
          rating: player.rating,
          matches: player.matches,
          wins: player.wins
        })
        .eq("id", player.id)
    )
  );

  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
}

export function revertMatchStats(players: Player[], match: Match) {
  const teamAWon = match.scoreA > match.scoreB;
  const winners = teamAWon ? match.teamA : match.teamB;
  const losers = teamAWon ? match.teamB : match.teamA;

  return players.map((player) => {
    if (winners.includes(player.id)) {
      return {
        ...player,
        rating: Math.max(0, player.rating - match.ratingDelta),
        matches: Math.max(0, player.matches - 1),
        wins: Math.max(0, player.wins - 1)
      };
    }

    if (losers.includes(player.id)) {
      return {
        ...player,
        rating: player.rating + match.ratingDelta,
        matches: Math.max(0, player.matches - 1)
      };
    }

    return player;
  });
}
