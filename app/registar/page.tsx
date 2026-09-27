"use client";

import { AlertCircle, Save } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import { SkeletonBlock } from "@/app/components/LoadingSkeleton";
import { useCreateMatch, usePlayers } from "@/lib/padel-queries";
import { localDateString } from "@/lib/local-date";
import MatchResultFields, { type ScoreDraft } from "@/app/components/MatchResultFields";
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

const emptyForm = (): MatchForm => {
  const query = typeof window === "undefined" ? null : new URLSearchParams(window.location.search);
  return {
  playedAt: localDateString(),
  a1: query?.get("a1") ?? "",
  a2: query?.get("a2") ?? "",
  b1: query?.get("b1") ?? "",
  b2: query?.get("b2") ?? "",
  sets: [{ a: 0, b: 0 }, { a: 0, b: 0 }, { a: 0, b: 0 }]
  };
};

export default function RegisterPage() {
  const [form, setForm] = useState<MatchForm>(emptyForm);
  const [scoreDraft, setScoreDraft] = useState<ScoreDraft>([{ a: "", b: "" }, { a: "", b: "" }, { a: "", b: "" }] as ScoreDraft);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const playersQuery = usePlayers();
  const createMatchMutation = useCreateMatch();
  const players = playersQuery.data ?? [];
  const loadingPlayers = playersQuery.isLoading;
  const saving = createMatchMutation.isPending;

  const queryError = playersQuery.error;
  const displayedError = error || (queryError ? queryError instanceof Error ? queryError.message : "Nao consegui carregar jogadores." : "");

  const registerMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ids = [form.a1, form.a2, form.b1, form.b2];

    if (queryError || loadingPlayers) return;
    if (!form.playedAt) {
      setSuccess("");
      setError("Escolhe a data do jogo.");
      return;
    }
    if (players.length < 4) {
      setSuccess("");
      setError("Ainda faltam jogadores. Para um 2v2 precisamos de 4 nomes.");
      return;
    }
    if (form.playedAt > localDateString()) {
      setSuccess("");
      setError("Calma campeão, esse jogo ainda está no futuro.");
      return;
    }
    if (new Set(ids).size !== 4) {
      setSuccess("");
      setError("Não vale repetir jogador. Escolhe 4 pessoas diferentes.");
      return;
    }

    if (scoreDraft.slice(0, 2).some((set) => set.a === "" || set.b === "") || (scoreDraft[2].a === "") !== (scoreDraft[2].b === "")) {
      setSuccess("");
      setError("Preenche os dois valores de cada set.");
      return;
    }

    const matchScore = calculateMatchScore(form.sets);
    if (!matchScore.valid) {
      setSuccess("");
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
      setError("");
      setSuccess("");
      await createMatchMutation.mutateAsync({
        playedAt: form.playedAt,
        teamA,
        teamB,
        scoreA: matchScore.scoreA,
        scoreB: matchScore.scoreB,
        sets: form.sets,
        ratingDelta: delta
      });
      setForm((current) => ({ ...emptyForm(), a1: current.a1, a2: current.a2, b1: current.b1, b2: current.b2 }));
      setScoreDraft([{ a: "", b: "" }, { a: "", b: "" }, { a: "", b: "" }] as ScoreDraft);
      setSuccess("Resultado guardado. Ranking atualizado sem dramas.");
    } catch (saveError) {
      setSuccess("");
      setError(saveError instanceof Error ? saveError.message : "Erro a guardar jogo.");
    }
  };

  return (
    <main className="shell appShell">
      <section className="compactHeader">
        <p className="eyebrow">Mais um Jogo</p>
        <h1>Registar jogo</h1>
      </section>

      {displayedError ? (
        <div className="notice" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {displayedError}
        </div>
      ) : null}
      {success ? <div className="notice successNotice" role="status">{success}</div> : null}

      <section className="panel">
        <form className="matchForm" onSubmit={registerMatch}>
          <label>
            Data
            <input
              type="date"
              required
              value={form.playedAt}
              onChange={(event) => setForm({ ...form, playedAt: event.target.value })}
            />
          </label>

          {loadingPlayers ? (
            <TeamSelectSkeleton />
          ) : (
            <MatchResultFields
              players={players}
              teamA={[form.a1, form.a2]}
              teamB={[form.b1, form.b2]}
              scoreDraft={scoreDraft}
              onTeamChange={(field, value) => setForm((current) => swapTeamPlayer(current, field, value))}
              onScoreDraftChange={(draft) => {
                setScoreDraft(draft);
                setForm({ ...form, sets: draft.map((set) => ({ a: set.a === "" ? 0 : Number(set.a), b: set.b === "" ? 0 : Number(set.b) })) as MatchFormSets });
              }}
            />
          )}

          <button className="primary" disabled={saving || loadingPlayers || players.length < 4 || Boolean(queryError)} type="submit">
            <Save size={16} aria-hidden="true" />
            {saving ? "A apontar..." : "Fechar resultado"}
          </button>
        </form>
      </section>
    </main>
  );
}

function swapTeamPlayer(form: MatchForm, field: "a1" | "a2" | "b1" | "b2", value: string): MatchForm {
  const fields = ["a1", "a2", "b1", "b2"] as const;
  const occupied = fields.find((candidate) => candidate !== field && form[candidate] === value);
  return occupied ? { ...form, [field]: value, [occupied]: form[field] } : { ...form, [field]: value };
}

function TeamSelectSkeleton() {
  return (
    <div className="teams" aria-label="A carregar jogadores">
      {Array.from({ length: 2 }).map((_, index) => (
        <fieldset className="skeletonTeamSelect" key={index}>
          <SkeletonBlock className="skeletonLine short" />
          <SkeletonBlock className="skeletonSelect" />
          <SkeletonBlock className="skeletonSelect" />
        </fieldset>
      ))}
    </div>
  );
}
