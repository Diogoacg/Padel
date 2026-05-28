"use client";

import { Info, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { ListSkeleton } from "@/app/components/LoadingSkeleton";
import {
  useActiveSeason,
  useCreatePlayer,
  useDeleteSeason,
  usePlayers,
  usePrefetchPlayer,
  useSeasons,
  useSeasonStandings
} from "@/lib/padel-queries";
import type { Player } from "@/lib/padel-data";

export default function PlayersPage() {
  const [newPlayer, setNewPlayer] = useState("");
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [viewedSeasonId, setViewedSeasonId] = useState("");
  const [showAlgorithm, setShowAlgorithm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const playersQuery = usePlayers();
  const activeSeasonQuery = useActiveSeason();
  const seasonsQuery = useSeasons();
  const createPlayerMutation = useCreatePlayer();
  const deleteSeasonMutation = useDeleteSeason();
  const prefetchPlayer = usePrefetchPlayer();
  const activeSeason = activeSeasonQuery.data ?? null;
  const seasons = seasonsQuery.data ?? [];
  const standingsQuery = useSeasonStandings(
    viewedSeasonId,
    Boolean(viewedSeasonId && viewedSeasonId !== activeSeason?.id)
  );
  const players: Player[] =
    viewedSeasonId && viewedSeasonId !== activeSeason?.id
      ? standingsQuery.data ?? []
      : playersQuery.data ?? [];
  const loading =
    playersQuery.isLoading ||
    activeSeasonQuery.isLoading ||
    seasonsQuery.isLoading ||
    standingsQuery.isLoading;
  const saving = createPlayerMutation.isPending;
  const seasonSaving = deleteSeasonMutation.isPending || standingsQuery.isFetching;

  useEffect(() => {
    const nextSeasonId = activeSeason?.id ?? seasons[0]?.id ?? "";
    if (!selectedSeasonId && nextSeasonId) {
      setSelectedSeasonId(nextSeasonId);
      setViewedSeasonId(nextSeasonId);
    }
  }, [activeSeason?.id, seasons, selectedSeasonId]);

  useEffect(() => {
    const queryError =
      playersQuery.error ?? activeSeasonQuery.error ?? seasonsQuery.error ?? standingsQuery.error;
    if (queryError) {
      setError(queryError instanceof Error ? queryError.message : "Nao consegui carregar a malta.");
    }
  }, [activeSeasonQuery.error, playersQuery.error, seasonsQuery.error, standingsQuery.error]);

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
    const seasonId = selectedSeasonId;
    if (!seasonId) return;

    try {
      setError("");
      const selectedSeason = seasons.find((season) => season.id === seasonId);
      setViewedSeasonId(seasonId);
      setSuccess(selectedSeason ? `A ver ranking de ${selectedSeason.name}.` : "");
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Nao consegui abrir essa epoca.");
    }
  };

  const removeSeason = async () => {
    const seasonId = selectedSeasonId;
    const season = seasons.find((item) => item.id === seasonId);
    if (!season) return;

    if (!window.confirm(`Apagar ${season.name}? Os jogos ficam sem época.`)) return;

    try {
      setError("");
      await deleteSeasonMutation.mutateAsync(seasonId);
      const nextSeasonId = activeSeason?.id ?? seasons.find((item) => item.id !== seasonId)?.id ?? "";
      setSelectedSeasonId(nextSeasonId);
      setViewedSeasonId(nextSeasonId);
      setSuccess(`${season.name} foi apagada.`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Nao consegui apagar a epoca.");
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
            duplas e o delta vem da dificuldade esperada. Um 2-1 vale menos, um
            2-0 vale normal, e diferenças grandes ou pneus dão bónus até 1.30x.
            Depois de 21 dias parado, levas -3 por semana até -60.
          </div>
        ) : null}

        {error ? <div className="notice">{error}</div> : null}
        {success ? <div className="notice successNotice">{success}</div> : null}

        <div className="seasonBox">
          <div>
            <span>Época ativa</span>
            <strong>{activeSeason?.name ?? "Ainda sem época"}</strong>
            <small>As épocas são semestrais: S1 é Jan-Jun, S2 é Jul-Dez.</small>
          </div>
          {seasons.length > 1 ? (
            <div className="seasonForm seasonManageForm">
              <select
                aria-label="Escolher época antiga"
                name="seasonId"
                onChange={(event) => setSelectedSeasonId(event.target.value)}
                value={selectedSeasonId}
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
              <button
                className="dangerIconButton"
                disabled={seasonSaving}
                onClick={() => void removeSeason()}
                title="Apagar época"
                type="button"
              >
                <Trash2 size={16} aria-hidden="true" />
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
