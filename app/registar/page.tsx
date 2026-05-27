"use client";

import { AlertCircle, Save } from "lucide-react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  createMatch,
  getPlayers,
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

const emptyForm = (): MatchForm => ({
  playedAt: new Date().toISOString().slice(0, 10),
  a1: "",
  a2: "",
  b1: "",
  b2: "",
  sets: [{ a: 6, b: 4 }, { a: 6, b: 4 }, { a: 0, b: 0 }]
});

export default function RegisterPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [form, setForm] = useState<MatchForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadPlayers = useCallback(async () => {
    const loadedPlayers = await getPlayers();
    setPlayers(loadedPlayers);
    setForm((current) => ({
      ...current,
      a1: current.a1 || loadedPlayers[0]?.id || "",
      a2: current.a2 || loadedPlayers[1]?.id || "",
      b1: current.b1 || loadedPlayers[2]?.id || "",
      b2: current.b2 || loadedPlayers[3]?.id || ""
    }));
  }, []);

  useEffect(() => {
    void loadPlayers();
  }, [loadPlayers]);

  const registerMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ids = [form.a1, form.a2, form.b1, form.b2];

    if (players.length < 4) {
      setError("Ainda faltam jogadores. Para um 2v2 precisamos de 4 nomes.");
      return;
    }
    if (new Set(ids).size !== 4) {
      setError("Não vale repetir jogador. Escolhe 4 pessoas diferentes.");
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
    const winnerSide = teamAWon ? "a" : "b";
    const delta = ratingDelta(
      averageRating(players, winners),
      averageRating(players, losers),
      form.sets,
      winnerSide
    );

    try {
      setSaving(true);
      setError("");
      await createMatch({
        playedAt: form.playedAt,
        teamA,
        teamB,
        scoreA: matchScore.scoreA,
        scoreB: matchScore.scoreB,
        sets: form.sets,
        ratingDelta: delta
      });
      const loadedPlayers = await getPlayers();
      setPlayers(loadedPlayers);
      setForm((current) => ({ ...emptyForm(), a1: current.a1, a2: current.a2, b1: current.b1, b2: current.b2 }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro a guardar jogo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="shell appShell">
      <section className="compactHeader">
        <p className="eyebrow">Mais um Jogo</p>
        <h1>Registar jogo</h1>
      </section>

      {error ? (
        <div className="notice" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {error}
        </div>
      ) : null}

      <section className="panel">
        <form className="matchForm" onSubmit={registerMatch}>
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
            {saving ? "A apontar..." : "Fechar resultado"}
          </button>
        </form>
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
