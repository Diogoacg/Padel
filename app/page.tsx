"use client";

import { Activity, Medal, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { getMatches, getPlayers, type Match, type Player } from "@/lib/padel-data";

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    async function loadData() {
      const [loadedPlayers, loadedMatches] = await Promise.all([getPlayers(), getMatches()]);
      setPlayers(loadedPlayers);
      setMatches(loadedMatches);
    }

    void loadData();
  }, []);

  const rankedPlayers = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating),
    [players]
  );
  const topPlayer = rankedPlayers[0];
  const averagePlayerRating = players.length
    ? Math.round(players.reduce((sum, player) => sum + player.rating, 0) / players.length)
    : 0;
  const totalMatches = players.reduce((sum, player) => sum + player.matches, 0) / 4;

  return (
    <main className="shell appShell">
      <section className="hero compactHero">
        <div>
          <p className="eyebrow">Padel lá de casa</p>
          <h1>6-0 não é set, é dívida.</h1>
          <p className="intro">Ver quem anda a enterrar.</p>
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

      <section className="metrics" aria-label="Métricas principais">
        <Metric icon={<Users />} label="Malta" value={players.length} />
        <Metric icon={<Swords />} label="Jogos" value={matches.length} />
        <Metric icon={<Activity />} label="Rating médio" value={averagePlayerRating} />
        <Metric icon={<Medal />} label="Jogos contados" value={totalMatches.toFixed(0)} />
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Top 5</p>
            <h2>Ranking</h2>
          </div>
          <Link className="textButton" href="/jogadores">Ver todos</Link>
        </div>

        <div className="playerList">
          {rankedPlayers.slice(0, 5).map((player, index) => (
            <Link className="playerRow playerLink" href={`/jogadores/${player.id}`} key={player.id}>
              <div className="rank">{index + 1}</div>
              <div>
                <strong>{player.name}</strong>
                <span>{player.matches} jogos · {player.wins} wins</span>
              </div>
              <div className="rating">{player.rating}</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
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
