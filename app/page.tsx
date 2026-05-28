"use client";

import { Activity, Flame, Info, Medal, ShieldAlert, Swords, Trophy, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { CardSkeletonGrid, ListSkeleton, MetricSkeletons } from "@/app/components/LoadingSkeleton";
import { useHomeDashboard, usePrefetchPlayer } from "@/lib/padel-queries";

export default function Home() {
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const dashboardQuery = useHomeDashboard();
  const prefetchPlayer = usePrefetchPlayer();
  const dashboard = dashboardQuery.data ?? null;
  const topPlayer = dashboard?.topPlayers[0];
  const loading = dashboardQuery.isLoading;

  return (
    <main className="shell appShell">
      <section className="hero compactHero">
        <div>
          <p className="eyebrow">Padel lá de casa</p>
          <h1>6-0 não é set, é dívida.</h1>
          <p className="intro">
            {dashboard ? `${dashboard.seasonName}: ` : ""}ver quem anda a enterrar.
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
        <Link href="/sorteio">Sortear equipas</Link>
      </section>

      {loading ? (
        <MetricSkeletons />
      ) : (
        <section className="metrics" aria-label="Métricas principais">
          <Metric icon={<Users />} label="Malta" value={dashboard?.totalPlayers ?? 0} />
          <Metric icon={<Swords />} label="Jogos" value={dashboard?.totalMatches ?? 0} />
          <Metric icon={<Activity />} label="Rating médio" value={dashboard?.averageRating ?? 0} />
          <Metric icon={<Medal />} label="Ferrugem" value={dashboard?.inactivePlayers ?? 0} />
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
              title={dashboard?.bestDuo?.label ?? "Sem dupla"}
              value={dashboard?.bestDuo ? `${dashboard.bestDuo.wins}/${dashboard.bestDuo.matches}` : "-"}
            />
            <DashboardCard
              icon={<ShieldAlert />}
              label="Maior surpresa"
              title={dashboard?.biggestUpset?.label ?? "Sem upset"}
              value={dashboard?.biggestUpset ? `+${dashboard.biggestUpset.gap}` : "-"}
            />
            <DashboardCard
              icon={<Flame />}
              label="Jogo de nervos"
              title={dashboard?.closestMatch?.label ?? "Ainda sem drama"}
              value={dashboard?.closestMatch?.sets ?? "-"}
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
            {(dashboard?.topPlayers ?? []).map((player, index) => (
              <Link
                className="playerRow playerLink"
                href={`/jogadores/${player.id}`}
                key={player.id}
                onFocus={() => void prefetchPlayer(player.id)}
                onMouseEnter={() => void prefetchPlayer(player.id)}
                onTouchStart={() => void prefetchPlayer(player.id)}
              >
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
