import { supabase } from "@/lib/supabase";
import type { MatchRecord, PlayerRecord, SeasonRecord } from "@/lib/types";

export type Player = {
  id: string;
  name: string;
  rating: number;
  matches: number;
  wins: number;
  inactivityPenalty: number;
  lastDecayAt: string | null;
};

export type Match = {
  id: string;
  seasonId: string | null;
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

export type Season = {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
  semesterYear: number | null;
  semesterHalf: number | null;
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
  wins: record.wins,
  inactivityPenalty: record.inactivity_penalty,
  lastDecayAt: record.last_decay_at
});

export const mapMatch = (record: MatchRecord): Match => ({
  id: record.id,
  seasonId: record.season_id,
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

export const mapSeason = (record: SeasonRecord): Season => ({
  id: record.id,
  name: record.name,
  startsAt: record.starts_at,
  endsAt: record.ends_at,
  active: record.active,
  semesterYear: record.semester_year,
  semesterHalf: record.semester_half
});

const matchSelect =
  "id, season_id, played_at, team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2, score_a, score_b, set_1_a, set_1_b, set_2_a, set_2_b, set_3_a, set_3_b, rating_delta, created_at";

const seasonSelect = "id, name, starts_at, ends_at, active, semester_year, semester_half, created_at";

export async function getPlayers() {
  if (!supabase) return [];

  await applyInactivityDecay();

  const { data, error } = await supabase
    .from("players")
    .select("id, name, rating, matches, wins, inactivity_penalty, last_decay_at, created_at")
    .order("rating", { ascending: false })
    .returns<PlayerRecord[]>();

  if (error) throw new Error(error.message);
  return data.map(mapPlayer);
}

export async function getSeasonStandings(seasonId: string) {
  if (!supabase) return [];

  const { data, error } = await supabase
    .rpc("season_player_standings", {
      p_season_id: seasonId
    })
    .returns<Array<{
      player_id: string;
      name: string;
      rating: number;
      matches: number;
      wins: number;
    }>>();

  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];

  return data.map((record) => ({
    id: record.player_id,
    name: record.name,
    rating: record.rating,
    matches: record.matches,
    wins: record.wins,
    inactivityPenalty: 0,
    lastDecayAt: null
  }));
}

export async function getPlayer(id: string) {
  if (!supabase) return null;

  await applyInactivityDecay();

  const { data, error } = await supabase
    .from("players")
    .select("id, name, rating, matches, wins, inactivity_penalty, last_decay_at, created_at")
    .eq("id", id)
    .single<PlayerRecord>();

  if (error) throw new Error(error.message);
  return mapPlayer(data);
}

export async function getMatches(seasonId?: string | null) {
  if (!supabase) return [];

  const query = supabase
    .from("matches")
    .select(matchSelect)
    .order("played_at", { ascending: false })
    .order("created_at", { ascending: false });

  const { data, error } = await (seasonId ? query.eq("season_id", seasonId) : query)
    .returns<MatchRecord[]>();

  if (error) throw new Error(error.message);
  return data.map(mapMatch);
}

export async function getSeasons() {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("seasons")
    .select(seasonSelect)
    .order("starts_at", { ascending: false })
    .returns<SeasonRecord[]>();

  if (error) throw new Error(error.message);
  return data.map(mapSeason);
}

export async function getActiveSeason() {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("seasons")
    .select(seasonSelect)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<SeasonRecord>();

  if (error) throw new Error(error.message);
  return data ? mapSeason(data) : null;
}

export async function getMatch(id: string) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("matches")
    .select(matchSelect)
    .eq("id", id)
    .single<MatchRecord>();

  if (error) throw new Error(error.message);
  if (!data || "Error" in data) {
    throw new Error("O Supabase nao devolveu o jogo registado.");
  }
  return mapMatch(data as MatchRecord);
}

export async function createPlayer(name: string) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .from("players")
    .insert({ name })
    .select("id, name, rating, matches, wins, inactivity_penalty, last_decay_at, created_at")
    .single<PlayerRecord>();

  if (error) throw new Error(error.message);
  return mapPlayer(data);
}

export async function createMatch(match: Omit<Match, "id" | "seasonId">) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .rpc("register_match", {
      p_played_at: match.playedAt,
      p_team_a_player_1: match.teamA[0],
      p_team_a_player_2: match.teamA[1],
      p_team_b_player_1: match.teamB[0],
      p_team_b_player_2: match.teamB[1],
      p_score_a: match.scoreA,
      p_score_b: match.scoreB,
      p_set_1_a: match.sets[0].a,
      p_set_1_b: match.sets[0].b,
      p_set_2_a: match.sets[1].a,
      p_set_2_b: match.sets[1].b,
      p_set_3_a: match.sets[2].a,
      p_set_3_b: match.sets[2].b,
      p_rating_delta: match.ratingDelta
    })
    .returns<MatchRecord>();

  if (error) throw new Error(error.message);
  if (!data || "Error" in data) {
    throw new Error("O Supabase nao devolveu o jogo registado.");
  }
  return mapMatch(data as MatchRecord);
}

export async function updateMatch(id: string, match: Omit<Match, "id" | "seasonId">) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .rpc("replace_match", {
      p_match_id: id,
      p_played_at: match.playedAt,
      p_team_a_player_1: match.teamA[0],
      p_team_a_player_2: match.teamA[1],
      p_team_b_player_1: match.teamB[0],
      p_team_b_player_2: match.teamB[1],
      p_score_a: match.scoreA,
      p_score_b: match.scoreB,
      p_set_1_a: match.sets[0].a,
      p_set_1_b: match.sets[0].b,
      p_set_2_a: match.sets[1].a,
      p_set_2_b: match.sets[1].b,
      p_set_3_a: match.sets[2].a,
      p_set_3_b: match.sets[2].b,
      p_rating_delta: match.ratingDelta
    })
    .returns<MatchRecord>();

  if (error) throw new Error(error.message);
  if (!data || "Error" in data) {
    throw new Error("O Supabase nao devolveu o jogo corrigido.");
  }
  return mapMatch(data as MatchRecord);
}

export async function startNewSeason(name: string) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .rpc("start_new_season", {
      p_name: name,
      p_starts_at: new Date().toISOString().slice(0, 10)
    })
    .returns<SeasonRecord>();

  if (error) throw new Error(error.message);
  if (!data || "Error" in data) {
    throw new Error("O Supabase nao criou a epoca.");
  }
  return mapSeason(data as SeasonRecord);
}

export async function switchActiveSeason(id: string) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .rpc("switch_active_season", {
      p_season_id: id
    })
    .returns<SeasonRecord>();

  if (error) throw new Error(error.message);
  if (!data || "Error" in data) {
    throw new Error("O Supabase nao mudou a epoca.");
  }
  return mapSeason(data as SeasonRecord);
}

export async function deleteSeason(id: string) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .rpc("delete_season", {
      p_season_id: id
    })
    .returns<string>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("O Supabase nao apagou a epoca.");
}

export async function applyInactivityDecay() {
  if (!supabase) return 0;

  const { data, error } = await supabase
    .rpc("apply_inactivity_decay", {
      p_today: new Date().toISOString().slice(0, 10)
    })
    .returns<number>();

  if (error) throw new Error(error.message);
  return data ?? 0;
}

export async function deleteMatch(id: string) {
  if (!supabase) throw new Error("Supabase nao esta configurado.");

  const { data, error } = await supabase
    .rpc("delete_match", { p_match_id: id })
    .returns<string>();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("O Supabase nao apagou o jogo.");
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
