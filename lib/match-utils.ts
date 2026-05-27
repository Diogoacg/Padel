import type { Match, Player, SetScore } from "@/lib/padel-data";

export type MatchFormSets = [SetScore, SetScore, SetScore];

const ELO_K = 24;

export const ratingDelta = (
  winnerAverage: number,
  loserAverage: number,
  sets: MatchFormSets,
  winnerSide: "a" | "b"
) => {
  const expected = 1 / (1 + Math.pow(10, (loserAverage - winnerAverage) / 400));
  return Math.max(1, Math.round(ELO_K * (1 - expected) * marginMultiplier(sets, winnerSide)));
};

export function averageRating(players: Player[], ids: string[]) {
  const selected = players.filter((player) => ids.includes(player.id));
  return selected.reduce((sum, player) => sum + player.rating, 0) / selected.length;
}

export function setsLabel(sets: Match["sets"]) {
  return sets
    .filter((set, index) => index < 2 || set.a + set.b > 0)
    .map((set) => `${set.a}-${set.b}`)
    .join(" / ");
}

export function calculateMatchScore(sets: MatchFormSets) {
  const playedSets = sets.filter((set, index) => index < 2 || set.a + set.b > 0);
  if (playedSets.length < 2) {
    return { valid: false, message: "Preenche pelo menos os dois primeiros sets.", scoreA: 0, scoreB: 0 };
  }

  let scoreA = 0;
  let scoreB = 0;
  const firstTwoWinners = sets.slice(0, 2).map((set) => {
    if (set.a === set.b) return "draw";
    return set.a > set.b ? "a" : "b";
  });

  if (
    firstTwoWinners[0] !== "draw" &&
    firstTwoWinners[0] === firstTwoWinners[1] &&
    sets[2].a + sets[2].b > 0
  ) {
    return {
      valid: false,
      message: "Se alguém ganhou os dois primeiros sets, o terceiro fica em branco.",
      scoreA: 0,
      scoreB: 0
    };
  }

  for (const set of playedSets) {
    if (set.a === set.b) {
      return { valid: false, message: "Um set não pode acabar empatado.", scoreA: 0, scoreB: 0 };
    }
    if (set.a > set.b) scoreA += 1;
    if (set.b > set.a) scoreB += 1;
  }

  if (scoreA !== 2 && scoreB !== 2) {
    return { valid: false, message: "O jogo tem de acabar 2-0 ou 2-1 em sets.", scoreA, scoreB };
  }

  return { valid: true, message: "", scoreA, scoreB };
}

function marginMultiplier(sets: MatchFormSets, winnerSide: "a" | "b") {
  const playedSets = sets.filter((set, index) => index < 2 || set.a + set.b > 0);
  const winnerSets = playedSets.filter((set) =>
    winnerSide === "a" ? set.a > set.b : set.b > set.a
  );
  const loserSets = playedSets.length - winnerSets.length;
  const straightSets = winnerSets.length === 2 && loserSets === 0;
  let multiplier = straightSets ? 1 : 0.85;

  for (const set of winnerSets) {
    const winnerGames = winnerSide === "a" ? set.a : set.b;
    const loserGames = winnerSide === "a" ? set.b : set.a;
    const gap = winnerGames - loserGames;

    if (gap >= 4) multiplier += 0.05;
    if (loserGames === 0) multiplier += 0.1;
  }

  return Math.min(1.3, multiplier);
}
