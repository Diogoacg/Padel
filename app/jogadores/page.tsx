"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { createPlayer, getPlayers, type Player } from "@/lib/padel-data";

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayer, setNewPlayer] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getPlayers().then(setPlayers);
  }, []);

  const rankedPlayers = useMemo(
    () => [...players].sort((a, b) => b.rating - a.rating),
    [players]
  );

  const addPlayer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newPlayer.trim();
    if (!name) return;

    setSaving(true);
    const player = await createPlayer(name);
    setPlayers((current) => [...current, player]);
    setNewPlayer("");
    setSaving(false);
  };

  return (
    <main className="shell appShell">
      <section className="compactHeader">
        <p className="eyebrow">A malta</p>
        <h1>Jogadores</h1>
      </section>

      <section className="panel">
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

        <div className="playerList">
          {rankedPlayers.map((player, index) => (
            <Link className="playerRow playerLink" href={`/jogadores/${player.id}`} key={player.id}>
              <div className="rank">{index + 1}</div>
              <div>
                <strong>{player.name}</strong>
                <span>{player.matches} jogos · {player.wins} wins</span>
              </div>
              <div className="rating">{player.rating}</div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
