"use client";

import { ArrowLeft, ChartNoAxesColumnIncreasing, Flame, Shield, TrendingDown, TrendingUp, UserRoundCheck, UserRoundX, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ListSkeleton, SkeletonBlock } from "@/app/components/LoadingSkeleton";
import { useActiveSeason, useMatches, usePlayer, usePlayerRatingHistory, usePlayers, usePrefetchMatch } from "@/lib/padel-queries";
import type { Match, Player, PlayerRatingHistoryPoint } from "@/lib/padel-data";

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const [error, setError] = useState("");
  const [showFullInsights, setShowFullInsights] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const activeSeasonQuery = useActiveSeason();
  const playerQuery = usePlayer(params.id);
  const playersQuery = usePlayers();
  const matchesQuery = useMatches(activeSeasonQuery.data?.id, !activeSeasonQuery.isLoading);
  const ratingHistoryQuery = usePlayerRatingHistory(
    params.id,
    activeSeasonQuery.data?.id,
    !activeSeasonQuery.isLoading
  );
  const prefetchMatch = usePrefetchMatch();
  const player = playerQuery.data ?? null;
  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const ratingHistory = ratingHistoryQuery.data ?? [];
  const loading =
    playerQuery.isLoading ||
    playersQuery.isLoading ||
    activeSeasonQuery.isLoading ||
    matchesQuery.isLoading ||
    ratingHistoryQuery.isLoading;

  const queryError =
    playerQuery.error ??
    playersQuery.error ??
    activeSeasonQuery.error ??
    matchesQuery.error ??
    ratingHistoryQuery.error;
  const displayError = error || (queryError instanceof Error ? queryError.message : queryError ? "Erro a abrir a ficha." : "");

  const playerMatches = useMemo(
    () => matches.filter((match) => matchHasPlayer(match, params.id)),
    [matches, params.id]
  );
  const rank = players.findIndex((item) => item.id === params.id) + 1;
  const winRate = player?.matches ? Math.round((player.wins / player.matches) * 100) : 0;
  const overall = player ? ratingToOverall(player.rating) : 0;
  const form = recentWins(playerMatches, params.id);
  const playerInsights = useMemo(
    () => buildPlayerInsights(playerMatches, params.id, players),
    [playerMatches, params.id, players]
  );

  return (
    <main className="shell detailShell">
      <Link className="backLink" href="/">
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar ao ranking
      </Link>

      {loading ? <PlayerProfileSkeleton /> : null}
      {displayError ? <div className="notice">{displayError}</div> : null}

      {!loading && player ? (
        <section className="playerDetailGrid">
          <article className="fifaCard">
            <div className="cardTop">
              <div>
                <strong>{overall}</strong>
                <span>OVR</span>
              </div>
              <div>
                <span>RK</span>
                <strong>#{rank || "-"}</strong>
              </div>
            </div>

            <div className="cardPortrait">
              <div className="playerBadge">{initials(player.name)}</div>
            </div>

            <div className="cardIdentity">
              <h1>{player.name}</h1>
              <p>Veio só aquecer, saiu no relatório.</p>
            </div>

            <div className="cardStats">
              <div>
                <strong>{player.rating}</strong>
                <span>RAT</span>
              </div>
              <div>
                <strong>{winRate}%</strong>
                <span>WIN</span>
              </div>
              <div>
                <strong>{form}</strong>
                <span>FOR</span>
              </div>
              <div>
                <strong>{player.matches}</strong>
                <span>JOG</span>
              </div>
            </div>
          </article>

          <section className="detailPanel">
            <p className="eyebrow">Ficha do jogador</p>
            <h2>{player.name} em números</h2>
            <div className="detailMetrics">
              <MiniStat icon={<Trophy />} label="Vitórias" value={player.wins} />
              <MiniStat icon={<Swords />} label="Jogos" value={player.matches} />
              <MiniStat icon={<Flame />} label="Win rate" value={`${winRate}%`} />
              <MiniStat icon={<Shield />} label="Rating" value={player.rating} />
              {player.inactivityPenalty > 0 ? (
                <MiniStat icon={<Flame />} label="Pausa" value={`-${player.inactivityPenalty}`} />
              ) : null}
            </div>

            <div className="sectionTitle">
              <p className="eyebrow">Bolsa do padel</p>
              <h2>Rating ao longo da época</h2>
            </div>

            <RatingHistory history={ratingHistory} />

            <div className="sectionTitle">
              <p className="eyebrow">Raio-X</p>
              <h2>Resumo picante</h2>
            </div>

            <div className="insightGrid compactInsights">
              <InsightCard
                icon={<UserRoundCheck />}
                label="Melhor parceiro"
                title={playerInsights.bestPartner?.name ?? "Ainda sem dupla"}
                value={playerInsights.bestPartner ? `${playerInsights.bestPartner.wins}/${playerInsights.bestPartner.matches}` : "-"}
              />
              <InsightCard
                icon={<Flame />}
                label="Momento"
                title={playerInsights.currentStreak.label}
                value={playerInsights.currentStreak.value}
                tone={playerInsights.currentStreak.tone}
              />
            </div>

            {showFullInsights ? (
              <div className="insightGrid expandedInsights">
                <InsightCard
                  icon={<UserRoundX />}
                  label="Pior dor de cabeça"
                  title={playerInsights.hardestOpponent?.name ?? "Ainda sem trauma"}
                  value={playerInsights.hardestOpponent ? `${playerInsights.hardestOpponent.losses} derrotas` : "-"}
                />
                <InsightCard
                  icon={<TrendingUp />}
                  label="Maior subida"
                  title={playerInsights.biggestGain?.label ?? "Sem ganhos"}
                  value={playerInsights.biggestGain ? `+${playerInsights.biggestGain.delta}` : "-"}
                  tone="gain"
                />
                <InsightCard
                  icon={<TrendingDown />}
                  label="Maior queda"
                  title={playerInsights.biggestLoss?.label ?? "Sem quedas"}
                  value={playerInsights.biggestLoss ? `-${playerInsights.biggestLoss.delta}` : "-"}
                  tone="loss"
                />
                <InsightCard
                  icon={<Trophy />}
                  label="Pneus dados"
                  title={String(playerInsights.bagelsGiven)}
                  value="sets a 6-0"
                  tone="gain"
                />
                <InsightCard
                  icon={<Shield />}
                  label="Pneus levados"
                  title={String(playerInsights.bagelsTaken)}
                  value="sets a seco"
                  tone={playerInsights.bagelsTaken > 0 ? "loss" : undefined}
                />
                <InsightCard
                  icon={<Swords />}
                  label="Jogos na época"
                  title={String(playerMatches.length)}
                  value={`${form}/5 forma`}
                />
              </div>
            ) : null}

            <button
              className="textButton expandButton"
              onClick={() => setShowFullInsights((current) => !current)}
              type="button"
            >
              {showFullInsights ? "Ver menos raio-x" : "Ver raio-x completo"}
            </button>

            <div className="sectionTitle">
              <p className="eyebrow">Histórico</p>
              <h2>{showFullHistory ? "Últimos jogos" : "Últimos 3 jogos"}</h2>
            </div>

            <div className="matchList">
              {playerMatches.length === 0 ? (
                <div className="emptyState">Ainda não há jogos nesta ficha.</div>
              ) : null}
              {playerMatches.slice(0, showFullHistory ? 8 : 3).map((match) => (
                <Link
                  className="matchRow matchLink"
                  href={`/jogos/${match.id}`}
                  key={match.id}
                  onFocus={() => void prefetchMatch(match.id)}
                  onMouseEnter={() => void prefetchMatch(match.id)}
                  onTouchStart={() => void prefetchMatch(match.id)}
                >
                  <time>{new Date(match.playedAt).toLocaleDateString("pt-PT")}</time>
                  <strong>{teamLabel(match.teamA, players)}</strong>
                  <span className="score">
                    {match.scoreA} - {match.scoreB}
                  </span>
                  <span className="setSummary">{setsLabel(match.sets)}</span>
                  <strong>{teamLabel(match.teamB, players)}</strong>
                  <span className={`eloSwing ${playerWonMatch(match, params.id) ? "gain" : "loss"}`}>
                    {playerWonMatch(match, params.id) ? "+" : "-"}
                    {match.ratingDelta}
                  </span>
                </Link>
              ))}
            </div>

            {playerMatches.length > 3 ? (
              <button
                className="textButton expandButton"
                onClick={() => setShowFullHistory((current) => !current)}
                type="button"
              >
                {showFullHistory ? "Ver só 3 jogos" : "Ver histórico completo"}
              </button>
            ) : null}
          </section>
        </section>
      ) : null}
    </main>
  );
}

function RatingHistory({ history }: { history: PlayerRatingHistoryPoint[] }) {
  if (history.length === 0) {
    return <div className="emptyState">Ainda não há movimentos de rating nesta época.</div>;
  }

  const ratings = history.map((point) => point.ratingAfter);
  const minRating = Math.min(...ratings, 1000);
  const maxRating = Math.max(...ratings, 1000);
  const range = Math.max(1, maxRating - minRating);
  const chartPoints = history.map((point, index) => {
    const x = history.length === 1 ? 50 : (index / (history.length - 1)) * 100;
    const y = 92 - ((point.ratingAfter - minRating) / range) * 76;
    return { ...point, x, y };
  });
  const linePath = chartPoints
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
  const latest = history[history.length - 1];
  const first = history[0];
  const totalChange = latest.ratingAfter - first.ratingBefore;

  return (
    <div className="ratingHistory">
      <div className="ratingHistoryHeader">
        <div>
          <ChartNoAxesColumnIncreasing size={18} aria-hidden="true" />
          <strong>{latest.ratingAfter}</strong>
          <span>rating atual</span>
        </div>
        <em className={totalChange >= 0 ? "gain" : "loss"}>
          {totalChange >= 0 ? "+" : ""}
          {totalChange} na época
        </em>
      </div>

      <div className="ratingLineChart" aria-label="Evolução do rating">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <path className="ratingLineArea" d={`${linePath} L 100 100 L 0 100 Z`} />
          <path className="ratingLine" d={linePath} />
        </svg>
        <div className="ratingPointLayer">
          {chartPoints.map((point) => (
            <Link
              className={`ratingPoint ${point.won ? "gain" : "loss"}`}
              href={`/jogos/${point.matchId}`}
              key={point.matchId}
              style={{ left: `${point.x}%`, top: `${point.y}%` }}
              title={`${new Date(point.playedAt).toLocaleDateString("pt-PT")} · ${point.ratingAfter}`}
            />
          ))}
        </div>
        <span className="ratingAxis top">{maxRating}</span>
        <span className="ratingAxis bottom">{minRating}</span>
      </div>

      <div className="ratingHistoryFooter">
        <span>{history.length} jogos com rating</span>
        <span>
          {first.ratingBefore} → {latest.ratingAfter}
        </span>
      </div>
    </div>
  );
}

function PlayerProfileSkeleton() {
  return (
    <section className="playerDetailGrid">
      <article className="fifaCard skeletonFifaCard">
        <div className="cardTop">
          <div>
            <SkeletonBlock className="skeletonLine tiny" />
            <SkeletonBlock className="skeletonLine short" />
          </div>
          <div>
            <SkeletonBlock className="skeletonLine short" />
            <SkeletonBlock className="skeletonLine tiny" />
          </div>
        </div>
        <div className="cardPortrait">
          <SkeletonBlock className="skeletonPortrait" />
        </div>
        <div className="cardIdentity">
          <SkeletonBlock className="skeletonLine long" />
          <SkeletonBlock className="skeletonLine medium" />
        </div>
        <div className="cardStats skeletonStats">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock className="skeletonLine short" key={index} />
          ))}
        </div>
      </article>

      <section className="detailPanel">
        <SkeletonBlock className="skeletonLine short" />
        <SkeletonBlock className="skeletonLine long" />
        <div className="detailMetrics">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="miniStat" key={index}>
              <SkeletonBlock className="skeletonIcon" />
              <SkeletonBlock className="skeletonLine short" />
              <SkeletonBlock className="skeletonLine medium" />
            </div>
          ))}
        </div>
        <ListSkeleton rows={3} />
      </section>
    </section>
  );
}

function MiniStat({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <article className="miniStat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function InsightCard({
  icon,
  label,
  title,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  title: string;
  value: string;
  tone?: "gain" | "loss";
}) {
  return (
    <article className={`insightCard ${tone ?? ""}`}>
      {icon}
      <span>{label}</span>
      <strong>{title}</strong>
      <em>{value}</em>
    </article>
  );
}

function matchHasPlayer(match: Match, playerId: string) {
  return [...match.teamA, ...match.teamB].includes(playerId);
}

function recentWins(matches: Match[], playerId: string) {
  return matches
    .slice(0, 5)
    .filter((match) => {
      const teamAWon = match.scoreA > match.scoreB;
      return teamAWon ? match.teamA.includes(playerId) : match.teamB.includes(playerId);
    }).length;
}

function playerWonMatch(match: Match, playerId: string) {
  const teamAWon = match.scoreA > match.scoreB;
  return teamAWon ? match.teamA.includes(playerId) : match.teamB.includes(playerId);
}

function buildPlayerInsights(matches: Match[], playerId: string, players: Player[]) {
  const partners = new Map<string, { id: string; name: string; matches: number; wins: number }>();
  const opponents = new Map<string, { id: string; name: string; matches: number; losses: number }>();
  let biggestGain: { delta: number; label: string } | null = null;
  let biggestLoss: { delta: number; label: string } | null = null;
  let bagelsGiven = 0;
  let bagelsTaken = 0;

  for (const match of matches) {
    const playerTeam = match.teamA.includes(playerId) ? match.teamA : match.teamB;
    const opponentTeam = match.teamA.includes(playerId) ? match.teamB : match.teamA;
    const won = playerWonMatch(match, playerId);
    const partnerId = playerTeam.find((id) => id !== playerId);

    if (partnerId) {
      const partner = partners.get(partnerId) ?? {
        id: partnerId,
        name: playerNameById(partnerId, players),
        matches: 0,
        wins: 0
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
        losses: 0
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
      const playerGames = playerTeam === match.teamA ? set.a : set.b;
      const opponentGames = playerTeam === match.teamA ? set.b : set.a;

      if (playerGames === 6 && opponentGames === 0) bagelsGiven += 1;
      if (playerGames === 0 && opponentGames === 6) bagelsTaken += 1;
    }
  }

  const bestPartner = Array.from(partners.values()).sort(
    (a, b) => b.wins - a.wins || b.matches - a.matches || a.name.localeCompare(b.name)
  )[0];
  const hardestOpponent = Array.from(opponents.values()).sort(
    (a, b) => b.losses - a.losses || b.matches - a.matches || a.name.localeCompare(b.name)
  )[0];

  return {
    bestPartner,
    hardestOpponent,
    biggestGain,
    biggestLoss,
    bagelsGiven,
    bagelsTaken,
    currentStreak: buildCurrentStreak(matches, playerId)
  };
}

function buildCurrentStreak(matches: Match[], playerId: string) {
  if (matches.length === 0) {
    return { label: "Sem série", value: "0 jogos", tone: undefined };
  }

  const firstWon = playerWonMatch(matches[0], playerId);
  let count = 0;

  for (const match of matches) {
    if (playerWonMatch(match, playerId) !== firstWon) break;
    count += 1;
  }

  return {
    label: firstWon ? "Está quente" : "Está a sofrer",
    value: `${firstWon ? "+" : "-"}${count} seguidos`,
    tone: firstWon ? "gain" as const : "loss" as const
  };
}

function ratingToOverall(rating: number) {
  return Math.max(40, Math.min(99, Math.round(rating / 15)));
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function teamLabel(team: [string, string], players: Player[]) {
  return team
    .map((id) => playerNameById(id, players))
    .join(" / ");
}

function playerNameById(id: string, players: Player[]) {
  return players.find((player) => player.id === id)?.name ?? "Jogador";
}

function setsLabel(sets: Match["sets"]) {
  return sets
    .filter((set, index) => index < 2 || set.a + set.b > 0)
    .map((set) => `${set.a}-${set.b}`)
    .join(" / ");
}
