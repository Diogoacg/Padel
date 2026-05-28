"use client";

import { Activity, Flame, Info, Medal, ShieldAlert, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CardSkeletonGrid, ListSkeleton, MetricSkeletons } from "@/app/components/LoadingSkeleton";
import { useActiveSeason, useMatches, usePlayers } from "@/lib/padel-queries";
import type { Match, Player } from "@/lib/padel-data";

export default function Home() {
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const activeSeasonQuery = useActiveSeason();
  const playersQuery = usePlayers();
  const matchesQuery = useMatches(activeSeasonQuery.data?.id, !activeSeasonQuery.isLoading);
  const players = playersQuery.data ?? [];
  const matches = matchesQuery.data ?? [];
  const activeSeason = activeSeasonQuery.data ?? null;
  const loading = playersQuery.isLoading || activeSeasonQuery.isLoading || matchesQuery.isLoading;

  const rankedPlayers = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating),
    [players]
  );
  const topPlayer = rankedPlayers[0];
  const averagePlayerRating = players.length
    ? Math.round(players.reduce((sum, player) => sum + player.rating, 0) / players.length)
    : 0;
  const inactivePlayers = players.filter((player) => player.inactivityPenalty > 0).length;
  const seasonDashboard = useMemo(
    () => buildSeasonDashboard(matches, players),
    [matches, players]
  );

  return (
    <main className="shell appShell">
      <section className="hero compactHero">
        <div>
          <p className="eyebrow">Padel lá de casa</p>
          <h1>6-0 não é set, é dívida.</h1>
          <p className="intro">
            {activeSeason ? `${activeSeason.name}: ` : ""}ver quem anda a enterrar.
          </p>
        </div>
        <Link className="heroPanel" href={topPlayer ? `/jogadores/${topPlayer.id}` : "/jogadores"}>
          <div>
            <span>Gay em alta</span>
            <strong>{topPlayer?.name ?? "Ainda ninguém"}</strong>
          </div>
          <Trophy aria-hidden="true" />
        </Link>
      </section>

      <section className="quickActions">
        <Link href="/registar">Registar jogo</Link>
        <Link href="/jogos">Ver jogos</Link>
      </section>

      {loading ? (
        <MetricSkeletons />
      ) : (
        <section className="metrics" aria-label="Métricas principais">
          <Metric icon={<Users />} label="Malta" value={players.length} />
          <Metric icon={<Swords />} label="Jogos" value={matches.length} />
          <Metric icon={<Activity />} label="Rating médio" value={averagePlayerRating} />
          <Metric icon={<Medal />} label="Ferrugem" value={inactivePlayers} />
        </section>
      )}

      <section className="panel seasonDashboard">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Época</p>
            <h2>O resumo sem filtros</h2>
          </div>
          <Link className="textButton" href="/jogos">Arquivo</Link>
        </div>

        {loading ? (
          <CardSkeletonGrid />
        ) : (
          <div className="dashboardGrid">
            <DashboardCard
              icon={<Trophy />}
              label="Campeão agora"
              title={topPlayer?.name ?? "Ainda ninguém"}
              value={topPlayer ? `${topPlayer.rating} RAT` : "-"}
            />
            <DashboardCard
              icon={<Users />}
              label="Dupla quente"
              title={seasonDashboard.bestDuo?.label ?? "Sem dupla"}
              value={seasonDashboard.bestDuo ? `${seasonDashboard.bestDuo.wins}/${seasonDashboard.bestDuo.matches}` : "-"}
            />
            <DashboardCard
              icon={<ShieldAlert />}
              label="Maior surpresa"
              title={seasonDashboard.biggestUpset?.label ?? "Sem upset"}
              value={seasonDashboard.biggestUpset ? `+${seasonDashboard.biggestUpset.gap}` : "-"}
            />
            <DashboardCard
              icon={<Flame />}
              label="Jogo de nervos"
              title={seasonDashboard.closestMatch?.label ?? "Ainda sem drama"}
              value={seasonDashboard.closestMatch?.sets ?? "-"}
            />
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Top 5</p>
            <h2>Ranking</h2>
          </div>
          <div className="headerActions">
            <button
              aria-expanded={showAlgorithm}
              aria-label="Ver algoritmo do rating"
              className="iconButton"
              onClick={() => setShowAlgorithm((current) => !current)}
              title="Algoritmo do rating"
              type="button"
            >
              <Info size={18} aria-hidden="true" />
            </button>
            <Link className="textButton" href="/jogadores">Ver todos</Link>
          </div>
        </div>

        {showAlgorithm ? <AlgorithmNote /> : null}

        {loading ? (
          <ListSkeleton rows={5} />
        ) : (
          <div className="playerList">
            {rankedPlayers.slice(0, 5).map((player, index) => (
              <Link className="playerRow playerLink" href={`/jogadores/${player.id}`} key={player.id}>
                <div className="rank">{index + 1}</div>
                <div>
                  <strong>{player.name}</strong>
                  <span>
                    {player.matches} jogos · {player.wins} wins
                    {player.inactivityPenalty > 0 ? ` · -${player.inactivityPenalty} pausa` : ""}
                  </span>
                </div>
                <div className="rating">{player.rating}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function DashboardCard({
  icon,
  label,
  title,
  value
}: {
  icon: ReactNode;
  label: string;
  title: string;
  value: string;
}) {
  return (
    <article className="dashboardCard">
      {icon}
      <span>{label}</span>
      <strong>{title}</strong>
      <em>{value}</em>
    </article>
  );
}

function AlgorithmNote() {
  return (
    <div className="algorithmNote">
      Elo por equipas: todos começam em 1000, calcula-se a média das duas duplas e o
      delta vem da dificuldade esperada. Um 2-1 vale menos, um 2-0 vale normal, e
      diferenças grandes ou pneus dão bónus até 1.30x. Quem fica mais de 21 dias sem
      jogar perde 3 pontos por semana, até 60 por ciclo de pausa.
    </div>
  );
}

function Metric({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <article className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function buildSeasonDashboard(matches: Match[], players: Player[]) {
  const playerRating = new Map(players.map((player) => [player.id, player.rating]));
  const playerName = (id: string) => players.find((player) => player.id === id)?.name ?? "Jogador";
  const duoStats = new Map<string, { label: string; matches: number; wins: number }>();
  let biggestUpset: { label: string; gap: number } | null = null;
  let closestMatch: { label: string; sets: string; gap: number } | null = null;

  for (const match of matches) {
    const teamAWon = match.scoreA > match.scoreB;
    const winners = teamAWon ? match.teamA : match.teamB;
    const losers = teamAWon ? match.teamB : match.teamA;

    for (const team of [match.teamA, match.teamB]) {
      const key = [...team].sort().join(":");
      const stat = duoStats.get(key) ?? {
        label: `${playerName(team[0])} / ${playerName(team[1])}`,
        matches: 0,
        wins: 0
      };
      stat.matches += 1;
      if (team.every((id) => winners.includes(id))) stat.wins += 1;
      duoStats.set(key, stat);
    }

    const winnerAverage = averageTeamRating(winners, playerRating);
    const loserAverage = averageTeamRating(losers, playerRating);
    const upsetGap = Math.round(loserAverage - winnerAverage);
    if (upsetGap > 0 && (!biggestUpset || upsetGap > biggestUpset.gap)) {
      biggestUpset = {
        label: `${playerName(winners[0])} / ${playerName(winners[1])}`,
        gap: upsetGap
      };
    }

    const totalGap = match.sets
      .filter((set, index) => index < 2 || set.a + set.b > 0)
      .reduce((sum, set) => sum + Math.abs(set.a - set.b), 0);
    if (!closestMatch || totalGap < closestMatch.gap) {
      closestMatch = {
        label: `${playerName(match.teamA[0])} / ${playerName(match.teamA[1])}`,
        sets: setsLabel(match.sets),
        gap: totalGap
      };
    }
  }

  const bestDuo = Array.from(duoStats.values()).sort(
    (a, b) => b.wins - a.wins || b.matches - a.matches || a.label.localeCompare(b.label)
  )[0];

  return { bestDuo, biggestUpset, closestMatch };
}

function averageTeamRating(ids: string[], playerRating: Map<string, number>) {
  return ids.reduce((sum, id) => sum + (playerRating.get(id) ?? 1000), 0) / ids.length;
}

function setsLabel(sets: Match["sets"]) {
  return sets
    .filter((set, index) => index < 2 || set.a + set.b > 0)
    .map((set) => `${set.a}-${set.b}`)
    .join(" / ");
}
