"use client";

import type { Player } from "@/lib/padel-data";
import { calculateMatchScore, type MatchFormSets } from "@/lib/match-utils";

export type ScoreDraft = [{ a: string; b: string }, { a: string; b: string }, { a: string; b: string }];

type Props = {
  players: Player[];
  teamA: [string, string];
  teamB: [string, string];
  scoreDraft: ScoreDraft;
  onTeamChange: (field: "a1" | "a2" | "b1" | "b2", value: string) => void;
  onScoreDraftChange: (draft: ScoreDraft) => void;
};

export function scoreDraftFromSets(sets: MatchFormSets): ScoreDraft {
  return sets.map((set, index) => ({
    a: index === 2 && set.a === 0 && set.b === 0 ? "" : String(set.a),
    b: index === 2 && set.a === 0 && set.b === 0 ? "" : String(set.b)
  })) as ScoreDraft;
}

export default function MatchResultFields({
  players,
  teamA,
  teamB,
  scoreDraft,
  onTeamChange,
  onScoreDraftChange
}: Props) {
  const firstTwoReady = scoreDraft.slice(0, 2).every((set) => set.a !== "" && set.b !== "");
  const firstTwoValid = firstTwoReady && Number(scoreDraft[0].a) !== Number(scoreDraft[0].b) && Number(scoreDraft[1].a) !== Number(scoreDraft[1].b);
  const firstTwoWinners = firstTwoValid
    ? scoreDraft.slice(0, 2).map((set) => Number(set.a) > Number(set.b) ? "a" : "b")
    : [];
  const tiedAfterTwo = firstTwoValid && firstTwoWinners[0] !== firstTwoWinners[1];
  const sets = scoreDraft.map((set) => ({ a: set.a === "" ? 0 : Number(set.a), b: set.b === "" ? 0 : Number(set.b) })) as MatchFormSets;
  const decidingSetReady = scoreDraft[2].a !== "" && scoreDraft[2].b !== "";
  const matchScore = firstTwoReady && (!tiedAfterTwo || decidingSetReady) ? calculateMatchScore(sets) : null;
  const summary = !firstTwoReady
    ? "Falta preencher os dois primeiros sets"
    : matchScore?.valid
      ? `Equipa ${matchScore.scoreA > matchScore.scoreB ? "A" : "B"} venceu ${matchScore.scoreA}-${matchScore.scoreB}`
      : tiedAfterTwo
        ? decidingSetReady ? "O set decisivo tem de ter um vencedor" : "1–1 · Falta o set decisivo"
        : "Os dois primeiros sets têm de ter um vencedor";

  const changeScore = (index: number, side: "a" | "b", value: string) => {
    if (!/^\d*$/.test(value)) return;
    // Keep the draft empty while editing, but never leave a leading zero after typing.
    const clean = value === "" ? "" : value.replace(/^0+(?=\d)/, "");
    const next = scoreDraft.map((set, setIndex) => setIndex === index ? { ...set, [side]: clean } : set) as ScoreDraft;
    const firstTwoComplete = next[0].a !== "" && next[0].b !== "" && next[1].a !== "" && next[1].b !== "";
    const firstTwoValid = firstTwoComplete && Number(next[0].a) !== Number(next[0].b) && Number(next[1].a) !== Number(next[1].b);
    const sameWinner = firstTwoValid &&
      (Number(next[0].a) > Number(next[0].b)) === (Number(next[1].a) > Number(next[1].b));
    if (sameWinner) next[2] = { a: "", b: "" };
    onScoreDraftChange(next);
  };

  const adjustScore = (index: number, side: "a" | "b", amount: number) => {
    const current = scoreDraft[index][side];
    const value = Math.max(0, (current === "" ? 0 : Number(current)) + amount).toString();
    changeScore(index, side, value);
  };

  return (
    <div className="resultFields" aria-label="Equipas e resultado">
      <div className="resultTeams">
        <TeamSelect title="Equipa A" values={teamA} players={players} fields={["a1", "a2"]} onChange={onTeamChange} />
        <TeamSelect title="Equipa B" values={teamB} players={players} fields={["b1", "b2"]} onChange={onTeamChange} />
      </div>
      <small className="teamSwapHint">Escolher alguém de outra dupla troca os jogadores.</small>

      <div className="resultScoreBoard" aria-label="Placar por set">
        <div className="resultSectionHeading"><span>Resultado</span><small>Toque no número ou use − / +</small></div>
        <div className="resultScoreHeader"><span>Sets</span><strong>Equipa A</strong><strong>Equipa B</strong></div>
        {[0, 1, ...(tiedAfterTwo ? [2] : [])].map((index) => (
          <div className="resultScoreRow" key={index}>
            <span>Set {index + 1}</span>
            {(["a", "b"] as const).map((side) => (
              <div className="scoreInput" key={side}>
                <button type="button" aria-label={`Diminuir Set ${index + 1}, Equipa ${side === "a" ? "A" : "B"}`} onClick={() => adjustScore(index, side, -1)}>−</button>
                <input
                  aria-label={`Set ${index + 1}, Equipa ${side === "a" ? "A" : "B"}`}
                  inputMode="numeric"
                  type="text"
                  pattern="[0-9]*"
                  value={scoreDraft[index][side]}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => changeScore(index, side, event.target.value)}
                />
                <button type="button" aria-label={`Aumentar Set ${index + 1}, Equipa ${side === "a" ? "A" : "B"}`} onClick={() => adjustScore(index, side, 1)}>+</button>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="resultSummary" aria-live="polite">{summary}</p>
    </div>
  );
}

function TeamSelect({ title, values, players, fields, onChange }: { title: string; values: [string, string]; players: Player[]; fields: ["a1" | "a2" | "b1" | "b2", "a1" | "a2" | "b1" | "b2"]; onChange: Props["onTeamChange"] }) {
  return (
    <fieldset className={title === "Equipa A" ? "teamSelect teamSelectA" : "teamSelect teamSelectB"}>
      <legend>{title}</legend>
      {values.map((value, index) => (
        <label key={fields[index]}>{`Jogador ${index + 1}`}
          <select aria-label={`${title}, jogador ${index + 1}`} value={value} required onChange={(event) => onChange(fields[index], event.target.value)}>
            <option value="" disabled>Escolher jogador</option>
            {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>
      ))}
    </fieldset>
  );
}
