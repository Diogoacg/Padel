"use client";

import { AlertCircle, ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  getMatch,
  getPlayers,
  updateMatch,
  type Player
} from "@/lib/padel-data";
import {
  averageRating,
  calculateMatchScore,
  ratingDelta,
  type MatchFormSets
} from "@/lib/match-utils";

type MatchForm = {
  playedAt: string;
  a1: string;
  a2: string;
  b1: string;
  b2: string;
  sets: MatchFormSets;
};

export default function EditMatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [form, setForm] = useState<MatchForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    const [loadedMatch, loadedPlayers] = await Promise.all([
      getMatch(params.id),
      getPlayers()
    ]);

    if (!loadedMatch) {
      throw new Error("Jogo nao encontrado.");
    }

    setPlayers(loadedPlayers);
    setForm({
      playedAt: loadedMatch.playedAt,
      a1: loadedMatch.teamA[0],
      a2: loadedMatch.teamA[1],
      b1: loadedMatch.teamB[0],
      b2: loadedMatch.teamB[1],
      sets: loadedMatch.sets
    });
  }, [params.id]);

  useEffect(() => {
    void loadData().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Erro a abrir edicao.");
    });
  }, [loadData]);

  const saveMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;

    const ids = [form.a1, form.a2, form.b1, form.b2];
    if (new Set(ids).size !== 4) {
      setError("Escolhe 4 jogadores diferentes.");
      return;
    }

    const matchScore = calculateMatchScore(form.sets);
    if (!matchScore.valid) {
      setError(matchScore.message);
      return;
    }

    const teamA = [form.a1, form.a2] as [string, string];
    const teamB = [form.b1, form.b2] as [string, string];
    const teamAWon = matchScore.scoreA > matchScore.scoreB;
    const winners = teamAWon ? teamA : teamB;
    const losers = teamAWon ? teamB : teamA;
    const delta = ratingDelta(
      averageRating(players, winners),
      averageRating(players, losers),
      form.sets,
      teamAWon ? "a" : "b"
    );

    try {
      setSaving(true);
      setError("");
      const updatedMatch = await updateMatch(params.id, {
        playedAt: form.playedAt,
        teamA,
        teamB,
        scoreA: matchScore.scoreA,
        scoreB: matchScore.scoreB,
        sets: form.sets,
        ratingDelta: delta
      });
      router.push(`/jogos/${updatedMatch.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro a corrigir jogo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="shell appShell">
      <Link className="backLink" href={`/jogos/${params.id}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar ao jogo
      </Link>

      <section className="compactHeader">
        <p className="eyebrow">Correção</p>
        <h1>Editar jogo</h1>
      </section>

      {error ? (
        <div className="notice" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <section className="panel">
        {!form ? <div className="emptyState">A carregar jogo...</div> : null}
        {form ? (
          <form className="matchForm" onSubmit={saveMatch}>
            <label>
              Data
              <input
                type="date"
                value={form.playedAt}
                onChange={(event) => setForm({ ...form, playedAt: event.target.value })}
              />
            </label>

            <div className="teams">
              <TeamSelect
                title="Equipa A"
                first={form.a1}
                second={form.a2}
                players={players}
                onFirst={(a1) => setForm({ ...form, a1 })}
                onSecond={(a2) => setForm({ ...form, a2 })}
              />
              <TeamSelect
                title="Equipa B"
                first={form.b1}
                second={form.b2}
                players={players}
                onFirst={(b1) => setForm({ ...form, b1 })}
                onSecond={(b2) => setForm({ ...form, b2 })}
              />
            </div>

            <div className="setBoard">
              {form.sets.map((set, index) => (
                <div className="setLine" key={index}>
                  <span>Set {index + 1}</span>
                  <label>
                    A
                    <input
                      type="number"
                      min="0"
                      value={set.a}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          sets: updateSetScore(form.sets, index, "a", Number(event.target.value))
                        })
                      }
                    />
                  </label>
                  <label>
                    B
                    <input
                      type="number"
                      min="0"
                      value={set.b}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          sets: updateSetScore(form.sets, index, "b", Number(event.target.value))
                        })
                      }
                    />
                  </label>
                </div>
              ))}
            </div>

            <button className="primary" disabled={saving || players.length < 4} type="submit">
              <Save size={16} aria-hidden="true" />
              {saving ? "A corrigir..." : "Guardar correção"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function TeamSelect({
  title,
  first,
  second,
  players,
  onFirst,
  onSecond
}: {
  title: string;
  first: string;
  second: string;
  players: Player[];
  onFirst: (value: string) => void;
  onSecond: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend>{title}</legend>
      <select value={first} onChange={(event) => onFirst(event.target.value)}>
        <option value="" disabled>Quem?</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>{player.name}</option>
        ))}
      </select>
      <select value={second} onChange={(event) => onSecond(event.target.value)}>
        <option value="" disabled>Quem?</option>
        {players.map((player) => (
          <option key={player.id} value={player.id}>{player.name}</option>
        ))}
      </select>
    </fieldset>
  );
}

function updateSetScore(
  sets: MatchFormSets,
  index: number,
  side: "a" | "b",
  value: number
) {
  return sets.map((set, currentIndex) =>
    currentIndex === index ? { ...set, [side]: value } : set
  ) as MatchFormSets;
}
