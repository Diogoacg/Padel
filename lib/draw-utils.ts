import type { Match, Player } from "@/lib/padel-data";

export type DrawResult = {
  teamA: [Player, Player];
  teamB: [Player, Player];
  gap: number;
  averageA: number;
  averageB: number;
};

type Pairing = [[Player, Player], [Player, Player]];

function validatePlayers(players: Player[]) {
  if (players.length !== 4) {
    throw new Error("É preciso escolher exatamente 4 jogadores.");
  }
  const ids = players.map((player) => player.id);
  if (new Set(ids).size !== 4) {
    throw new Error("Os 4 jogadores têm de ser distintos.");
  }
  if (players.some((player) => !Number.isFinite(player.rating))) {
    throw new Error("Todos os jogadores têm de ter um rating válido.");
  }
}

export function buildBalancedDraw(players: Player[]): DrawResult {
  validatePlayers(players);
  const rankedPairings = allPairings(players)
    .map(([teamA, teamB]) => {
      const averageA = teamAverage(teamA);
      const averageB = teamAverage(teamB);
      return { teamA, teamB, averageA, averageB, gap: Math.abs(averageA - averageB) };
    })
    .sort((a, b) => a.gap - b.gap);

  return rankedPairings[0];
}

export function buildRandomDraw(
  players: Player[],
  previousDraw: string | null,
  rng: () => number = Math.random
): DrawResult {
  validatePlayers(players);
  const pairings = allPairings(players);
  const availablePairings = previousDraw
    ? pairings.filter((pairing) => pairingKey(pairing[0], pairing[1]) !== previousDraw)
    : pairings;
  const randomValue = rng();
  if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
    throw new Error("O gerador aleatório devolveu um valor inválido.");
  }
  const selectedPairing = availablePairings[Math.floor(randomValue * availablePairings.length)];
  const [teamA, teamB] = selectedPairing;
  const averageA = teamAverage(teamA);
  const averageB = teamAverage(teamB);
  return { teamA, teamB, averageA, averageB, gap: Math.abs(averageA - averageB) };
}

export function findLastMatchPairing(matches: Match[], playerIds: string[]): string | null {
  if (playerIds.length !== 4 || new Set(playerIds).size !== 4) return null;
  const selectedKey = [...playerIds].sort().join(":");
  const lastMatch = matches
    .map((match, index) => ({ match, index }))
    .filter(({ match }) => match.status === "completed")
    .filter(({ match }) => [...match.teamA, ...match.teamB].sort().join(":") === selectedKey)
    .sort((a, b) => {
      const dateDifference = Date.parse(b.match.playedAt) - Date.parse(a.match.playedAt);
      return dateDifference || a.index - b.index;
    })[0]?.match;

  return lastMatch ? pairingKeyFromIds(lastMatch.teamA, lastMatch.teamB) : null;
}

export function pairingKeyFromIds(teamA: [string, string], teamB: [string, string]): string {
  return [[...teamA].sort().join("-"), [...teamB].sort().join("-")].sort().join(":");
}

function allPairings(players: Player[]): Pairing[] {
  return [
    [[players[0], players[1]], [players[2], players[3]]],
    [[players[0], players[2]], [players[1], players[3]]],
    [[players[0], players[3]], [players[1], players[2]]]
  ];
}

function pairingKey(teamA: [Player, Player], teamB: [Player, Player]) {
  return pairingKeyFromIds([teamA[0].id, teamA[1].id], [teamB[0].id, teamB[1].id]);
}

function teamAverage(players: [Player, Player]) {
  return (players[0].rating + players[1].rating) / 2;
}
