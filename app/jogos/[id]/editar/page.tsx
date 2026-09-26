"use client";

import { AlertCircle, ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { useMatch, usePlayers, useUpdateMatch } from "@/lib/padel-queries";
import { localDateString } from "@/lib/local-date";
import MatchResultFields, { scoreDraftFromSets, type ScoreDraft } from "@/app/components/MatchResultFields";
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
  const [editedForm, setEditedForm] = useState<MatchForm | null>(null);
  const [error, setError] = useState("");
  const [editedScoreDraft, setEditedScoreDraft] = useState<ScoreDraft | null>(null);
  const matchQuery = useMatch(params.id);
  const playersQuery = usePlayers();
  const updateMatchMutation = useUpdateMatch();
  const players = playersQuery.data ?? [];
  const saving = updateMatchMutation.isPending;

  const form = editedForm ?? (matchQuery.data ? matchFormFromMatch(matchQuery.data) : null);
  const scoreDraft = editedScoreDraft ?? (form
    ? form.sets.every((set) => set.a === 0 && set.b === 0) ? emptyScoreDraft() : scoreDraftFromSets(form.sets)
    : null);
  const queryError = matchQuery.error ?? playersQuery.error;
  const displayedError = error || (queryError ? queryError instanceof Error ? queryError.message : "Erro a abrir edicao." : "");

  const saveMatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form) return;

    const ids = [form.a1, form.a2, form.b1, form.b2];
    if (form.playedAt > localDateString()) {
      setError("Ainda nao da para meter resultado de um jogo futuro.");
      return;
    }
    if (new Set(ids).size !== 4) {
      setError("Escolhe 4 jogadores diferentes.");
      return;
    }

    if (!scoreDraft || scoreDraft.slice(0, 2).some((set) => set.a === "" || set.b === "") || (scoreDraft[2].a === "") !== (scoreDraft[2].b === "")) {
      setError("Preenche os dois valores de cada set.");
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
      setError("");
      const updatedMatch = await updateMatchMutation.mutateAsync({
        id: params.id,
        match: {
          playedAt: form.playedAt,
          teamA,
          teamB,
          scoreA: matchScore.scoreA,
          scoreB: matchScore.scoreB,
          sets: form.sets,
          ratingDelta: delta
        }
      });
      router.push(`/jogos/${updatedMatch.id}?saved=result`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Erro a corrigir jogo.");
    }
  };

  return (
    <main className="shell appShell">
      <Link className="backLink" href={`/jogos/${params.id}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar ao jogo
      </Link>

      <section className="compactHeader">
        <p className="eyebrow">{matchQuery.data?.status === "pending" ? "Resultado" : "Correção"}</p>
        <h1>{matchQuery.data?.status === "pending" ? "Fechar jogo" : "Editar jogo"}</h1>
      </section>

      {displayedError ? (
        <div className="notice" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          {displayedError}
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
              required
              value={form.playedAt}
              onChange={(event) => setEditedForm({ ...form, playedAt: event.target.value })}
              />
            </label>

            <MatchResultFields
              players={players}
              teamA={[form.a1, form.a2]}
              teamB={[form.b1, form.b2]}
              scoreDraft={scoreDraft ?? scoreDraftFromSets(form.sets)}
              onTeamChange={(field, value) => setEditedForm((current) => swapTeamPlayer(current ?? form, field, value))}
              onScoreDraftChange={(draft) => {
                setEditedScoreDraft(draft);
                setEditedForm({ ...form, sets: draft.map((set) => ({ a: set.a === "" ? 0 : Number(set.a), b: set.b === "" ? 0 : Number(set.b) })) as MatchFormSets });
              }}
            />

            <button className="primary" disabled={saving || players.length < 4 || Boolean(queryError)} type="submit">
              <Save size={16} aria-hidden="true" />
              {saving
                ? matchQuery.data?.status === "pending" ? "A fechar..." : "A corrigir..."
                : matchQuery.data?.status === "pending" ? "Guardar resultado" : "Guardar correção"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}

function matchFormFromMatch(match: { playedAt: string; teamA: [string, string]; teamB: [string, string]; status: string; sets: MatchFormSets }): MatchForm {
  return {
    playedAt: match.playedAt,
    a1: match.teamA[0], a2: match.teamA[1], b1: match.teamB[0], b2: match.teamB[1],
    sets: match.status === "pending" ? [{ a: 0, b: 0 }, { a: 0, b: 0 }, { a: 0, b: 0 }] : match.sets
  };
}

function emptyScoreDraft(): ScoreDraft {
  return [{ a: "", b: "" }, { a: "", b: "" }, { a: "", b: "" }];
}

function swapTeamPlayer(form: MatchForm, field: "a1" | "a2" | "b1" | "b2", value: string): MatchForm {
  const fields = ["a1", "a2", "b1", "b2"] as const;
  const occupied = fields.find((candidate) => candidate !== field && form[candidate] === value);
  return occupied ? { ...form, [field]: value, [occupied]: form[field] } : { ...form, [field]: value };
}
