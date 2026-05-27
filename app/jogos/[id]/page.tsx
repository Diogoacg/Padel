"use client";

import { ArrowLeft, CalendarDays, Gauge, Pencil, Swords, Trash2, Trophy } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  getMatch,
  getPlayers,
  deleteMatch,
  type Match,
  type Player
} from "@/lib/padel-data";

export default function MatchPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadMatch() {
      try {
        setLoading(true);
        setError("");
        const [loadedMatch, loadedPlayers] = await Promise.all([
          getMatch(params.id),
          getPlayers()
        ]);
        setMatch(loadedMatch);
        setPlayers(loadedPlayers);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Erro a abrir o jogo.");
      } finally {
        setLoading(false);
      }
    }

    void loadMatch();
  }, [params.id]);

  const winner = useMemo(() => {
    if (!match) return "";
    return match.scoreA > match.scoreB ? "Equipa A" : "Equipa B";
  }, [match]);

  const removeMatch = async () => {
    if (!match || deleting) return;
    const confirmed = window.confirm("Apagar este jogo e corrigir o ranking?");
    if (!confirmed) return;

    try {
      setDeleting(true);
      setError("");
      await deleteMatch(match.id);
      router.push("/jogos");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Erro a apagar o jogo.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="shell detailShell">
      <Link className="backLink" href="/">
        <ArrowLeft size={16} aria-hidden="true" />
        Voltar aos jogos
      </Link>

      {loading ? <div className="emptyState">A ir buscar o resultado...</div> : null}
      {error ? <div className="notice">{error}</div> : null}

      {!loading && match ? (
        <section className="matchDetailStack">
          <PadelCourt
            deleting={deleting}
            match={match}
            onDelete={removeMatch}
            players={players}
            winner={winner}
          />
          <div className="detailPanel">
            <div className="detailActions">
              <Link className="textButton" href={`/jogos/${match.id}/editar`}>
                <Pencil size={16} aria-hidden="true" />
                Corrigir jogo
              </Link>
            </div>

            <div className="detailMetrics">
              <MiniStat
                icon={<CalendarDays />}
                label="Data"
                value={new Date(match.playedAt).toLocaleDateString("pt-PT")}
              />
              <MiniStat icon={<Trophy />} label="Vencedor" value={winner} />
              <MiniStat icon={<Gauge />} label="Delta" value={`+${match.ratingDelta}`} />
              <MiniStat icon={<Swords />} label="Formato" value="2v2" />
            </div>

            <div className="teamsDetail">
              <TeamCard title="Equipa A" ids={match.teamA} players={players} />
              <TeamCard title="Equipa B" ids={match.teamB} players={players} />
            </div>

            <div className="setsDetail">
              {match.sets
                .filter((set, index) => index < 2 || set.a + set.b > 0)
                .map((set, index) => (
                  <article key={index}>
                    <span>Set {index + 1}</span>
                    <strong>
                      {set.a} - {set.b}
                    </strong>
                  </article>
                ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function PadelCourt({
  deleting,
  match,
  onDelete,
  players,
  winner
}: {
  deleting: boolean;
  match: Match;
  onDelete: () => void;
  players: Player[];
  winner: string;
}) {
  return (
    <section className="padelCourtWrap" aria-label="Simulacao do campo">
      <div className="courtHeader">
        <div>
          <p className="eyebrow">Campo da partida</p>
          <h1>
            {match.scoreA} - {match.scoreB}
          </h1>
        </div>
        <div>
          <span>{setsLabel(match.sets)}</span>
          <strong>{winner} ganhou</strong>
          <button
            className="dangerButton"
            disabled={deleting}
            onClick={onDelete}
            type="button"
          >
            <Trash2 size={16} aria-hidden="true" />
            {deleting ? "A apagar..." : "Apagar jogo"}
          </button>
        </div>
      </div>

      <div className="padelCourt">
        <div className="courtGlass courtGlassTop" />
        <div className="courtGlass courtGlassBottom" />
        <div className="courtLine courtOuter" />
        <div className="courtLine courtNet" />
        <div className="courtLine courtServiceLeft" />
        <div className="courtLine courtServiceRight" />
        <div className="courtLine courtCenterLeft" />
        <div className="courtLine courtCenterRight" />

        <CourtPlayer id={match.teamA[0]} side="a left" players={players} />
        <CourtPlayer id={match.teamA[1]} side="a right" players={players} />
        <CourtPlayer id={match.teamB[0]} side="b left" players={players} />
        <CourtPlayer id={match.teamB[1]} side="b right" players={players} />

        <div className="courtScore">
          <span>Sets</span>
          <strong>
            {match.scoreA} - {match.scoreB}
          </strong>
        </div>
      </div>
    </section>
  );
}

function CourtPlayer({
  id,
  side,
  players
}: {
  id: string;
  side: string;
  players: Player[];
}) {
  const player = players.find((item) => item.id === id);

  return (
    <Link className={`courtPlayer ${side}`} href={`/jogadores/${id}`}>
      <span>{initials(player?.name ?? "Jogador")}</span>
      <strong>{player?.name ?? "Jogador"}</strong>
    </Link>
  );
}

function TeamCard({
  title,
  ids,
  players
}: {
  title: string;
  ids: [string, string];
  players: Player[];
}) {
  return (
    <article className="teamCard">
      <p className="eyebrow">{title}</p>
      {ids.map((id) => {
        const player = players.find((item) => item.id === id);
        return (
          <Link href={`/jogadores/${id}`} key={id}>
            <span>{player?.name ?? "Jogador"}</span>
            <strong>{player?.rating ?? "-"}</strong>
          </Link>
        );
      })}
    </article>
  );
}

function MiniStat({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <article className="miniStat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function setsLabel(sets: Match["sets"]) {
  return sets
    .filter((set, index) => index < 2 || set.a + set.b > 0)
    .map((set) => `${set.a}-${set.b}`)
    .join(" / ");
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
