export type PlayerProfileSet = { a: number; b: number };

export type PlayerProfileMatch = {
  id: string;
  seasonId: string | null;
  status: "pending" | "completed";
  playedAt: string;
  teamA: [string, string];
  teamB: [string, string];
  scoreA: number;
  scoreB: number;
  sets: [PlayerProfileSet, PlayerProfileSet, PlayerProfileSet];
  ratingDelta: number;
};

export type PlayerProfilePlayer = { id: string; name: string };

export function completedPlayerMatches<T extends PlayerProfileMatch>(
  matches: readonly T[],
  playerId: string,
  seasonId?: string,
): T[] {
  return matches
    .filter(
      (match) =>
        match.status === "completed" &&
        (match.teamA.includes(playerId) || match.teamB.includes(playerId)) &&
        (seasonId === undefined || match.seasonId === seasonId),
    )
    // getMatches already orders equal civil dates by created_at descending.
    // Returning 0 preserves that stable order after mapMatch discards created_at.
    .sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

export function playerWonMatch(match: PlayerProfileMatch, playerId: string): boolean {
  const teamAWon = match.scoreA > match.scoreB;
  return teamAWon ? match.teamA.includes(playerId) : match.teamB.includes(playerId);
}

export function recentWins(matches: readonly PlayerProfileMatch[], playerId: string): number {
  return matches
    .slice(0, 5)
    .filter((match) => playerWonMatch(match, playerId)).length;
}

export function teamLabel(team: [string, string], players: readonly PlayerProfilePlayer[]): string {
  return team.map((id) => playerNameById(id, players)).join(" / ");
}

export function setsLabel(sets: readonly PlayerProfileSet[]): string {
  return sets
    .filter((set, index) => index < 2 || set.a + set.b > 0)
    .map((set) => `${set.a}-${set.b}`)
    .join(" / ");
}

export function buildPlayerInsights(
  matches: readonly PlayerProfileMatch[],
  playerId: string,
  players: readonly PlayerProfilePlayer[],
) {
  const partners = new Map<string, { id: string; name: string; matches: number; wins: number }>();
  const opponents = new Map<string, { id: string; name: string; matches: number; losses: number }>();
  let biggestGain: { delta: number; label: string } | null = null;
  let biggestLoss: { delta: number; label: string } | null = null;
  let bagelsGiven = 0;
  let bagelsTaken = 0;

  for (const match of matches) {
    const isOnTeamA = match.teamA.includes(playerId);
    const playerTeam = isOnTeamA ? match.teamA : match.teamB;
    const opponentTeam = isOnTeamA ? match.teamB : match.teamA;
    const won = playerWonMatch(match, playerId);
    const partnerId = playerTeam.find((id) => id !== playerId);

    if (partnerId) {
      const partner = partners.get(partnerId) ?? {
        id: partnerId,
        name: playerNameById(partnerId, players),
        matches: 0,
        wins: 0,
      };
      partner.matches += 1;
      if (won) partner.wins += 1;
      partners.set(partnerId, partner);
    }

    for (const opponentId of opponentTeam) {
      const opponent = opponents.get(opponentId) ?? {
        id: opponentId,
        name: playerNameById(opponentId, players),
        matches: 0,
        losses: 0,
      };
      opponent.matches += 1;
      if (!won) opponent.losses += 1;
      opponents.set(opponentId, opponent);
    }

    const label = `${new Date(match.playedAt).toLocaleDateString("pt-PT")} · ${setsLabel(match.sets)}`;
    if (won && (!biggestGain || match.ratingDelta > biggestGain.delta)) {
      biggestGain = { delta: match.ratingDelta, label };
    }
    if (!won && (!biggestLoss || match.ratingDelta > biggestLoss.delta)) {
      biggestLoss = { delta: match.ratingDelta, label };
    }

    for (const set of match.sets.filter((currentSet, index) => index < 2 || currentSet.a + currentSet.b > 0)) {
      const playerGames = isOnTeamA ? set.a : set.b;
      const opponentGames = isOnTeamA ? set.b : set.a;
      if (playerGames === 6 && opponentGames === 0) bagelsGiven += 1;
      if (playerGames === 0 && opponentGames === 6) bagelsTaken += 1;
    }
  }

  const bestPartner = Array.from(partners.values()).sort(
    (a, b) => b.wins - a.wins || b.matches - a.matches || a.name.localeCompare(b.name),
  )[0];
  const hardestOpponent = Array.from(opponents.values())
    .filter((opponent) => opponent.losses > 0)
    .sort(
      (a, b) => b.losses - a.losses || b.matches - a.matches || a.name.localeCompare(b.name),
    )[0];

  return {
    bestPartner,
    hardestOpponent,
    biggestGain,
    biggestLoss,
    bagelsGiven,
    bagelsTaken,
    currentStreak: buildCurrentStreak(matches, playerId),
  };
}

function buildCurrentStreak(matches: readonly PlayerProfileMatch[], playerId: string) {
  if (matches.length === 0) return { label: "Sem série", value: "0 jogos", tone: undefined };

  const firstWon = playerWonMatch(matches[0], playerId);
  let count = 0;
  for (const match of matches) {
    if (playerWonMatch(match, playerId) !== firstWon) break;
    count += 1;
  }

  return {
    label: firstWon ? "Está quente" : "Está a sofrer",
    value: `${firstWon ? "+" : "-"}${count} seguidos`,
    tone: firstWon ? "gain" as const : "loss" as const,
  };
}

function playerNameById(id: string, players: readonly PlayerProfilePlayer[]): string {
  return players.find((player) => player.id === id)?.name ?? "Jogador";
}
