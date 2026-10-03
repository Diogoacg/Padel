"use client";

import { ArrowLeft, ChartNoAxesColumnIncreasing, Flame, Shield, TrendingDown, TrendingUp, UserRoundCheck, UserRoundX, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { ListSkeleton, SkeletonBlock } from "@/app/components/LoadingSkeleton";
import { useActiveSeason, useMatches, usePlayer, usePlayerRatingHistory, usePlayers, usePrefetchMatch, useSeasonStandings } from "@/lib/padel-queries";
import type { PlayerRatingHistoryPoint } from "@/lib/padel-data";
import {
  buildPlayerInsights,
  completedPlayerMatches,
  playerWonMatch,
  recentWins,
  setsLabel,
  teamLabel
} from "@/lib/player-profile-utils";

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const [error, setError] = useState("");
  const [showFullInsights, setShowFullInsights] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);
  const activeSeasonQuery = useActiveSeason();
  const playerQuery = usePlayer(params.id);
  const playersQuery = usePlayers();
  const activeSeason = activeSeasonQuery.data ?? null;
  const matchesQuery = useMatches(activeSeason?.id, !activeSeasonQuery.isLoading && Boolean(activeSeason?.id));
  const standingsQuery = useSeasonStandings(activeSeason?.id ?? "", Boolean(activeSeason?.id));
  const ratingHistoryQuery = usePlayerRatingHistory(
    params.id,
    activeSeason?.id,
    !activeSeasonQuery.isLoading && Boolean(activeSeason?.id)
  );
  const prefetchMatch = usePrefetchMatch();
  const player = playerQuery.data ?? null;
  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const standings = useMemo(() => standingsQuery.data ?? [], [standingsQuery.data]);
  const ratingHistory = ratingHistoryQuery.data ?? [];
  const loading =
    playerQuery.isLoading ||
    playersQuery.isLoading ||
    activeSeasonQuery.isLoading ||
    matchesQuery.isLoading ||
    matchesQuery.isPlaceholderData ||
    standingsQuery.isLoading ||
    ratingHistoryQuery.isLoading ||
    ratingHistoryQuery.isPlaceholderData;

  const queryError =
    playerQuery.error ??
    playersQuery.error ??
    activeSeasonQuery.error ??
    matchesQuery.error ??
    standingsQuery.error ??
    ratingHistoryQuery.error;
  const displayError = error || (queryError instanceof Error ? queryError.message : queryError ? "Erro a abrir a ficha." : "");

  const playerMatches = useMemo(
    () => completedPlayerMatches(matches, params.id, activeSeason?.id ?? ""),
    [matches, params.id, activeSeason?.id]
  );
  const rankedPlayers = useMemo(
    () => [...standings].sort((a, b) => b.rating - a.rating),
    [standings]
  );
  const rankIndex = rankedPlayers.findIndex((item) => item.id === params.id);
  const rank = rankIndex >= 0 && rankedPlayers[rankIndex].matches > 0 ? rankIndex + 1 : null;
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
                <strong>{rank ? `#${rank}` : "–"}</strong>
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
                <span>ATUAL</span>
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
              <MiniStat icon={<Shield />} label="Rating atual" value={player.rating} />
              <MiniStat icon={<TrendingUp />} label="Elo base" value={player.baseRating ?? player.rating} />
              <MiniStat icon={<Flame />} label="Penalização de inatividade" value={`-${player.inactivityPenalty}`} />
              <MiniStat icon={<TrendingDown />} label="Perda permanente por inatividade" value={`-${player.inactivityForfeit}`} />
            </div>

            <div className="sectionTitle">
              <p className="eyebrow">Bolsa do padel</p>
              <h2>Elo base ao longo da época</h2>
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
              aria-expanded={showFullInsights}
              className="textButton expandButton"
              onClick={() => setShowFullInsights((current) => !current)}
              type="button"
            >
              {showFullInsights ? "Ver menos raio-x" : "Ver raio-x completo"}
            </button>

            <div className="sectionTitle">
              <p className="eyebrow">Histórico</p>
              <h2>{showFullHistory ? "Histórico completo" : "Últimos 3 jogos"}</h2>
            </div>

            <div className="matchList">
              {playerMatches.length === 0 ? (
                <div className="emptyState">
                  {activeSeason
                    ? `Ainda não há jogos concluídos na época ${activeSeason.name}.`
                    : "Ainda não há uma época ativa com jogos concluídos."}
                </div>
              ) : null}
              {(showFullHistory ? playerMatches : playerMatches.slice(0, 3)).map((match) => (
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
                aria-expanded={showFullHistory}
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
    return <div className="emptyState">Ainda não há jogos com alteração de Elo base nesta época.</div>;
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
          <span>Elo base no último jogo</span>
        </div>
        <em className={totalChange >= 0 ? "gain" : "loss"}>
          {totalChange >= 0 ? "+" : ""}
          {totalChange} na época
        </em>
      </div>

      <div className="ratingLineChart" aria-label="Evolução do Elo base">
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
              title={`${new Date(point.playedAt).toLocaleDateString("pt-PT")} · Elo base ${point.ratingAfter}`}
            />
          ))}
        </div>
        <span className="ratingAxis top">{maxRating}</span>
        <span className="ratingAxis bottom">{minRating}</span>
      </div>

      <div className="ratingHistoryFooter">
        <span>{history.length} jogos com Elo base</span>
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
