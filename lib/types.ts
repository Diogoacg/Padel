export type PlayerRecord = {
  id: string;
  name: string;
  rating: number;
  matches: number;
  wins: number;
  inactivity_penalty: number;
  last_decay_at: string | null;
  created_at: string;
};

export type MatchRecord = {
  id: string;
  season_id: string | null;
  played_at: string;
  team_a_player_1: string;
  team_a_player_2: string;
  team_b_player_1: string;
  team_b_player_2: string;
  score_a: number;
  score_b: number;
  set_1_a: number;
  set_1_b: number;
  set_2_a: number;
  set_2_b: number;
  set_3_a: number;
  set_3_b: number;
  rating_delta: number;
  created_at: string;
};

export type SeasonRecord = {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
  semester_year: number | null;
  semester_half: number | null;
  created_at: string;
};
