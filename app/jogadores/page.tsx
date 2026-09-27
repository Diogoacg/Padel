"use client";

import { Info, Plus } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { ListSkeleton } from "@/app/components/LoadingSkeleton";
import {
  useActiveSeason,
  useCreatePlayer,
  usePrefetchPlayer,
  useSeasons,
  useSeasonStandings
} from "@/lib/padel-queries";
import type { Player } from "@/lib/padel-data";

export default function PlayersPage() {
  const [newPlayer, setNewPlayer] = useState("");
  const [selectedSeason, setSelectedSeason] = useState<{ activeSeasonId: string | null; id: string }>({ activeSeasonId: null, id: "" });
  const [viewedSeason, setViewedSeason] = useState<{ activeSeasonId: string | null; id: string }>({ activeSeasonId: null, id: "" });
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const activeSeasonQuery = useActiveSeason();
  const seasonsQuery = useSeasons();
  const createPlayerMutation = useCreatePlayer();
  const prefetchPlayer = usePrefetchPlayer();
  const activeSeason = activeSeasonQuery.data ?? null;
  const seasons = useMemo(() => seasonsQuery.data ?? [], [seasonsQuery.data]);
  const activeSeasonId = activeSeason?.id ?? null;
  const effectiveSelectedSeasonId = selectedSeason.activeSeasonId === activeSeasonId && selectedSeason.id
    ? selectedSeason.id
    : activeSeason?.id || seasons[0]?.id || "";
  const effectiveViewedSeasonId = viewedSeason.activeSeasonId === activeSeasonId && viewedSeason.id
    ? viewedSeason.id
    : activeSeason?.id || seasons[0]?.id || "";
  const standingsQuery = useSeasonStandings(effectiveViewedSeasonId, Boolean(effectiveViewedSeasonId));
  const players: Player[] = useMemo(() => standingsQuery.data ?? [], [standingsQuery.data]);
  const loading =
    activeSeasonQuery.isLoading ||
    seasonsQuery.isLoading ||
    standingsQuery.isLoading;
  const saving = createPlayerMutation.isPending;
  const seasonSaving = standingsQuery.isFetching;

  const queryError =
    activeSeasonQuery.error ?? seasonsQuery.error ?? standingsQuery.error;
  const displayError = error || (queryError instanceof Error ? queryError.message : queryError ? "Nao consegui carregar a malta." : "");

  const rankedPlayers = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating),
    [players]
  );

  const addPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newPlayer.trim();
    if (!name) return;

    try {
      setError("");
      const player = await createPlayerMutation.mutateAsync(name);
      setNewPlayer("");
      setSuccess(`${player.name} entrou na lista.`);
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Nao consegui juntar o jogador.");
    }
  };

  const viewSeason = async () => {
    const seasonId = effectiveSelectedSeasonId;
    if (!seasonId) return;

    try {
      setError("");
      const selectedSeason = seasons.find((season) => season.id === seasonId);
      setViewedSeason({ activeSeasonId, id: seasonId });
      setSuccess(selectedSeason ? `A ver ranking de ${selectedSeason.name}.` : "");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Nao consegui abrir essa epoca.");
    }
  };

  return (
    <main className="shell appShell">
      <section className="compactHeader">
        <p className="eyebrow">A malta</p>
        <h1>Jogadores</h1>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <div>
            <p className="eyebrow">Ranking</p>
            <h2>Tabela da vergonha</h2>
          </div>
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
        </div>

        {showAlgorithm ? (
          <div className="algorithmNote">
            Elo por equipas: todos começam em 1000, calcula-se a média das duas
            duplas e o delta vem da dificuldade esperada. Um 2-1 multiplica o
            delta por 0,90 e um 2-0 por 1,40. Depois de 30 dias sem jogar,
            perdes temporariamente 25 pontos por semana iniciada, até 200.
            Se regressares após 60 dias, parte dessa penalização passa a perda
            permanente: 10%, mais 10 pontos percentuais por semana iniciada,
            até 50%. Cada trimestre recomeça em 1000.
          </div>
        ) : null}

        {displayError ? <div className="notice">{displayError}</div> : null}
        {success ? <div className="notice successNotice">{success}</div> : null}

        <div className="seasonBox">
          <div>
            <span>Época ativa</span>
            <strong>{activeSeason?.name ?? "Ainda sem época"}</strong>
            <small>
              {activeSeason
                ? `Válida de ${new Date(`${activeSeason.startsAt}T12:00:00`).toLocaleDateString("pt-PT")} a ${activeSeason.endsAt ? new Date(`${activeSeason.endsAt}T12:00:00`).toLocaleDateString("pt-PT") : "sem data final"}.`
                : "Cada época dura três meses e começa no primeiro dia do trimestre."}
            </small>
          </div>
          {seasons.length > 1 ? (
            <div className="seasonForm seasonManageForm">
              <select
                aria-label="Escolher época antiga"
                name="seasonId"
                onChange={(event) => setSelectedSeason({ activeSeasonId, id: event.target.value })}
                value={effectiveSelectedSeasonId}
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
              <button disabled={seasonSaving} onClick={() => void viewSeason()} type="button">
                Ver
              </button>
            </div>
          ) : null}
        </div>

        <form className="inlineForm" onSubmit={addPlayer}>
          <input
            aria-label="Nome do novo jogador"
            value={newPlayer}
            onChange={(event) => setNewPlayer(event.target.value)}
            placeholder="Nome do craque"
          />
          <button disabled={saving} type="submit">
            <Plus size={16} aria-hidden="true" />
            Juntar
          </button>
        </form>

        {loading ? (
          <ListSkeleton rows={6} />
        ) : (
          <div className="playerList">
            {rankedPlayers.length === 0 ? (
              <p className="emptyState">Ainda ninguém jogou nesta época. Regista o primeiro jogo para começar o ranking.</p>
            ) : null}
            {rankedPlayers.map((player, index) => (
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
