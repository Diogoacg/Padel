"use client";

import { ArrowLeft, Flame, Shield, TrendingDown, TrendingUp, UserRoundCheck, UserRoundX, Swords, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  getActiveSeason,
  getMatches,
  getPlayer,
  getPlayers,
  type Match,
  type Player
} from "@/lib/padel-data";

export default function PlayerPage() {
  const params = useParams<{ id: string }>();
  const [player, setPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPlayer() {
      try {
        setLoading(true);
        setError("");
        const loadedSeason = await getActiveSeason();
        const [loadedPlayer, loadedPlayers, loadedMatches] = await Promise.all([
          getPlayer(params.id),
          getPlayers(),
          getMatches(loadedSeason?.id)
        ]);
        setPlayer(loadedPlayer);
        setPlayers(loadedPlayers);
        setMatches(loadedMatches);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Erro a abrir a ficha.");
      } finally {
        setLoading(false);
      }
    }

    void loadPlayer();
  }, [params.id]);

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

      {loading ? <div className="emptyState">A imprimir a carta...</div> : null}
      {error ? <div className="notice">{error}</div> : null}

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
              <p className="eyebrow">Raio-X</p>
              <h2>Com quem rende e quem chateia</h2>
            </div>

            <div className="insightGrid">
              <InsightCard
                icon={<UserRoundCheck />}
                label="Melhor parceiro"
                title={playerInsights.bestPartner?.name ?? "Ainda sem dupla"}
                value={playerInsights.bestPartner ? `${playerInsights.bestPartner.wins}/${playerInsights.bestPartner.matches}` : "-"}
              />
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
            </div>

            <div className="sectionTitle">
              <p className="eyebrow">Histórico</p>
              <h2>Últimos jogos</h2>
            </div>

            <div className="matchList">
              {playerMatches.length === 0 ? (
                <div className="emptyState">Ainda não há jogos nesta ficha.</div>
              ) : null}
              {playerMatches.slice(0, 8).map((match) => (
                <Link className="matchRow matchLink" href={`/jogos/${match.id}`} key={match.id}>
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
          </section>
        </section>
      ) : null}
    </main>
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
  }

  const bestPartner = Array.from(partners.values()).sort(
    (a, b) => b.wins - a.wins || b.matches - a.matches || a.name.localeCompare(b.name)
  )[0];
  const hardestOpponent = Array.from(opponents.values()).sort(
    (a, b) => b.losses - a.losses || b.matches - a.matches || a.name.localeCompare(b.name)
  )[0];

  return { bestPartner, hardestOpponent, biggestGain, biggestLoss };
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
