"use client";

import { RotateCcw, Shuffle, Swords, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ListSkeleton } from "@/app/components/LoadingSkeleton";
import { useActiveSeason, useCreatePendingMatch, useMatches, usePlayers } from "@/lib/padel-queries";
import type { Player } from "@/lib/padel-data";
import {
  buildBalancedDraw,
  buildRandomDraw,
  findLastMatchPairing,
  type DrawResult
} from "@/lib/draw-utils";

export default function DrawPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"balanced" | "random">("balanced");
  const playersQuery = usePlayers();
  const activeSeasonQuery = useActiveSeason();
  const matchesQuery = useMatches(
    activeSeasonQuery.data?.id,
    mode === "random" && activeSeasonQuery.isSuccess && Boolean(activeSeasonQuery.data?.id)
  );
  const players = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);
  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [plannedAt, setPlannedAt] = useState(new Date().toISOString().slice(0, 10));
  const [draw, setDraw] = useState<DrawResult | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const createPendingMatchMutation = useCreatePendingMatch();
  const selectedPlayers = useMemo(
    () => selectedIds
      .map((id) => players.find((player) => player.id === id))
      .filter((player): player is Player => Boolean(player)),
    [players, selectedIds]
  );
  const previousDraw = useMemo(() => (
    selectedIds.length === 4 ? findLastMatchPairing(matches, selectedIds) : null
  ), [matches, selectedIds]);

  const togglePlayer = (id: string) => {
    setDraw(null);
    setSuccess("");
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 4) return current;
      return [...current, id];
    });
  };

  const generateTeams = () => {
    if (selectedPlayers.length !== 4) return;
    if (mode === "random" && (!activeSeasonQuery.isSuccess || !activeSeasonQuery.data?.id || matchesQuery.isLoading || matchesQuery.isError)) {
      setError("Não é possível sortear sem confirmar a época e o histórico. Tenta novamente.");
      return;
    }
    let nextDraw: DrawResult;
    try {
      nextDraw = mode === "balanced"
        ? buildBalancedDraw(selectedPlayers)
        : buildRandomDraw(selectedPlayers, previousDraw);
    } catch (drawError) {
      setError(drawError instanceof Error ? drawError.message : "Não consegui sortear as duplas.");
      return;
    }

    setError("");
    setDraw(nextDraw);
    setSuccess(
      mode === "balanced"
        ? "Duplas equilibradas. Já dá para mandar a convocatória."
        : previousDraw
          ? "Duplas sorteadas. Não repetiu o último desenho destes 4."
          : "Duplas sorteadas."
    );
  };

  const reset = () => {
    setSelectedIds([]);
    setDraw(null);
    setError("");
    setSuccess("");
  };

  const createPending = async () => {
    if (!draw) return;

    try {
      setError("");
      setSuccess("");
      await createPendingMatchMutation.mutateAsync({
        playedAt: plannedAt,
        teamA: [draw.teamA[0].id, draw.teamA[1].id],
        teamB: [draw.teamB[0].id, draw.teamB[1].id]
      });
      router.push("/jogos?created=pending");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Nao consegui criar o jogo.");
    }
  };

  return (
    <main className="shell appShell">
      <section className="compactHeader">
        <p className="eyebrow">Pré-jogo</p>
        <h1>Sortear equipas</h1>
        <p className="intro compactIntro">
          Escolhe 4 disponíveis e eu tento não criar uma tragédia anunciada.
        </p>
      </section>

      <section className="panel">
        {error ? <div className="notice" role="alert">{error}</div> : null}
        {success ? <div className="notice successNotice" role="status">{success}</div> : null}

        {playersQuery.isError ? (
          <div className="notice" role="alert">
            Não consegui carregar os jogadores. <button className="textButton" onClick={() => void playersQuery.refetch()} type="button">Tentar novamente</button>
          </div>
        ) : null}
        {activeSeasonQuery.isError ? (
          <div className="notice" role="alert">
            Não consegui carregar a época ativa. <button className="textButton" onClick={() => void activeSeasonQuery.refetch()} type="button">Tentar novamente</button>
          </div>
        ) : null}
        {mode === "random" && matchesQuery.isError ? (
          <div className="notice" role="alert">
            Não consegui carregar o histórico. <button className="textButton" onClick={() => void matchesQuery.refetch()} type="button">Tentar novamente</button>
          </div>
        ) : null}

        <label className="drawDate">
          Data do jogo
          <input
            type="date"
            value={plannedAt}
            onChange={(event) => {
              setPlannedAt(event.target.value);
              setSuccess("");
            }}
          />
        </label>

        <div className="drawMode" aria-label="Modo de sorteio">
          <button
            className={mode === "balanced" ? "active" : ""}
            onClick={() => {
              setMode("balanced");
              setDraw(null);
              setSuccess("");
            }}
            type="button"
          >
            Por rating
          </button>
          <button
            className={mode === "random" ? "active" : ""}
            onClick={() => {
              setMode("random");
              setDraw(null);
              setSuccess("");
            }}
            type="button"
          >
            Aleatório
          </button>
        </div>

        <div className="drawStatus">
          <div>
            <Users size={18} aria-hidden="true" />
            <strong>{selectedPlayers.length}/4</strong>
            <span>escolhidos</span>
          </div>
          <button className="textButton" onClick={reset} type="button">
            <RotateCcw size={16} aria-hidden="true" />
            Limpar
          </button>
        </div>

        {playersQuery.isLoading ? (
          <ListSkeleton rows={6} />
        ) : (
          <div className="playerPicker">
            {players.map((player) => {
              const selected = selectedIds.includes(player.id);
              const locked = !selected && selectedIds.length >= 4;

              return (
                <button
                  className={selected ? "playerPick selected" : "playerPick"}
                  disabled={locked}
                  key={player.id}
                  onClick={() => togglePlayer(player.id)}
                  type="button"
                >
                  <span>{player.name}</span>
                  <strong>{player.rating}</strong>
                </button>
              );
            })}
          </div>
        )}

        <button
          className="primary drawButton"
          disabled={selectedPlayers.length !== 4 || playersQuery.isLoading || (mode === "random" && (activeSeasonQuery.isLoading || activeSeasonQuery.isError || !activeSeasonQuery.data?.id || matchesQuery.isLoading || matchesQuery.isError))}
          onClick={generateTeams}
          type="button"
        >
          <Shuffle size={16} aria-hidden="true" />
          {mode === "balanced" ? "Gerar duplas" : "Sortear à sorte"}
        </button>
      </section>

      {draw ? (
        <section className="panel drawResult">
          <div className="panelHeader">
            <div>
              <p className="eyebrow">Duplas</p>
              <h2>{mode === "balanced" ? "Mais equilibrado possível" : "Saiu assim, está entregue"}</h2>
            </div>
            <div className="drawGap">
              <Swords size={16} aria-hidden="true" />
              {draw.gap} dif.
            </div>
          </div>

          <div className="drawTeams">
            <DrawTeam title="Equipa A" players={draw.teamA} average={draw.averageA} />
            <DrawTeam title="Equipa B" players={draw.teamB} average={draw.averageB} />
          </div>

          <button
            className="primary drawRegisterLink"
            disabled={createPendingMatchMutation.isPending}
            onClick={() => void createPending()}
            type="button"
          >
            {createPendingMatchMutation.isPending ? "A criar jogo..." : "Criar jogo com estas duplas"}
          </button>
        </section>
      ) : null}

      {mode === "random" && previousDraw && !draw ? (
        <div className="drawHint">
          No aleatório vou evitar repetir as duplas do último jogo entre estes 4.
        </div>
      ) : null}
    </main>
  );
}

function DrawTeam({
  title,
  players,
  average
}: {
  title: string;
  players: [Player, Player];
  average: number;
}) {
  return (
    <article className="drawTeam">
      <span>{title}</span>
      <strong>{players[0].name}</strong>
      <strong>{players[1].name}</strong>
      <em>{average} rating médio</em>
    </article>
  );
}
