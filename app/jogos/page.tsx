"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { GameCardSkeletons } from "@/app/components/LoadingSkeleton";
import { useActiveSeason, useDeleteMatch, useMatches, usePlayers, useSeasons } from "@/lib/padel-queries";
import type { Match } from "@/lib/padel-data";
import { setsLabel } from "@/lib/match-utils";

export default function MatchesPage() {
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [error, setError] = useState("");
  const activeSeasonQuery = useActiveSeason();
  const seasonsQuery = useSeasons();
  const playersQuery = usePlayers();
  const activeSeason = activeSeasonQuery.data ?? null;
  const seasons = seasonsQuery.data ?? [];
  const nextSeasonId = selectedSeasonId || activeSeason?.id || seasons[0]?.id || "";
  const matchesQuery = useMatches(nextSeasonId || undefined, Boolean(nextSeasonId));
  const deleteMatchMutation = useDeleteMatch();
  const players = playersQuery.data ?? [];
  const matches = matchesQuery.data ?? [];
  const loading =
    playersQuery.isLoading ||
    seasonsQuery.isLoading ||
    activeSeasonQuery.isLoading ||
    matchesQuery.isLoading;
  const saving = deleteMatchMutation.isPending;

  useEffect(() => {
    if (!selectedSeasonId && nextSeasonId) {
      setSelectedSeasonId(nextSeasonId);
    }
  }, [nextSeasonId, selectedSeasonId]);

  const playerName = (id: string) =>
    players.find((player) => player.id === id)?.name ?? "Jogador";

  const removeMatch = async (match: Match) => {
    if (saving || !window.confirm("Apagar este jogo e corrigir o ranking?")) return;

    try {
      setError("");
      await deleteMatchMutation.mutateAsync(match.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Erro a apagar jogo.");
    }
  };

  const selectedSeason = seasons.find((season) => season.id === selectedSeasonId) ?? activeSeason;

  return (
    <main className="shell appShell">
      <section className="compactHeader">
        <p className="eyebrow">Arquivo</p>
        <h1>Jogos</h1>
        {selectedSeason ? <p className="intro compactIntro">{selectedSeason.name}</p> : null}
      </section>

      {error ? <div className="notice" role="alert">{error}</div> : null}

      <section className="panel">
        {seasons.length > 1 ? (
          <div className="archiveFilter">
            <label>
              Época
              <select
                value={selectedSeasonId}
                onChange={(event) => setSelectedSeasonId(event.target.value)}
              >
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>
                    {season.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {loading ? (
          <GameCardSkeletons />
        ) : (
          <div className="gameCards">
            {matches.map((match) => (
              <article className="gameCard" key={match.id}>
                <div className="gameCardTop">
                  <time>{new Date(match.playedAt).toLocaleDateString("pt-PT")}</time>
                  <button
                    className="dangerIconButton"
                    disabled={saving}
                    onClick={() => void removeMatch(match)}
                    title="Apagar jogo"
                    type="button"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>

                <Link className="gameCardMain" href={`/jogos/${match.id}`}>
                  <div className="gameTeam">
                    <span>Equipa A</span>
                    <strong>{playerName(match.teamA[0])} / {playerName(match.teamA[1])}</strong>
                  </div>

                  <div className="gameScoreBlock">
                    <strong>{match.scoreA} - {match.scoreB}</strong>
                    <span>{setsLabel(match.sets)}</span>
                  </div>

                  <div className="gameTeam">
                    <span>Equipa B</span>
                    <strong>{playerName(match.teamB[0])} / {playerName(match.teamB[1])}</strong>
                  </div>
                </Link>
              </article>
            ))}

            {matches.length === 0 ? (
              <div className="emptyState">Ainda não há jogos registados.</div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
