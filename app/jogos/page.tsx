"use client";

import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  deleteMatch,
  getActiveSeason,
  getMatches,
  getPlayers,
  getSeasons,
  type Match,
  type Player,
  type Season
} from "@/lib/padel-data";
import { setsLabel } from "@/lib/match-utils";

export default function MatchesPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async (seasonId?: string) => {
    const loadedSeason = await getActiveSeason();
    const [loadedPlayers, loadedSeasons] = await Promise.all([
      getPlayers(),
      getSeasons()
    ]);
    const nextSeasonId = seasonId || loadedSeason?.id || loadedSeasons[0]?.id || "";
    const loadedMatches = await getMatches(nextSeasonId);
    setPlayers(loadedPlayers);
    setMatches(loadedMatches);
    setActiveSeason(loadedSeason);
    setSeasons(loadedSeasons);
    setSelectedSeasonId(nextSeasonId);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const playerName = (id: string) =>
    players.find((player) => player.id === id)?.name ?? "Jogador";

  const removeMatch = async (match: Match) => {
    if (saving || !window.confirm("Apagar este jogo e corrigir o ranking?")) return;

    try {
      setSaving(true);
      setError("");
      await deleteMatch(match.id);
      setMatches((current) => current.filter((item) => item.id !== match.id));
      const loadedPlayers = await getPlayers();
      setPlayers(loadedPlayers);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Erro a apagar jogo.");
      await loadData();
    } finally {
      setSaving(false);
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
                onChange={(event) => void loadData(event.target.value)}
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
      </section>
    </main>
  );
}
