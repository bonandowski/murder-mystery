"use client";

import { useState } from "react";
import { gameApi } from "@/lib/client/api";
import type { PlayerView } from "@/lib/game/view";
import { characterLabel } from "../RichText";
import { Badge, Card, ErrorText, Title } from "../ui";

export function VotePanel({ view, onChanged }: { view: PlayerView; onChanged: () => void }) {
  const vote = view.vote;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!vote) return null;

  async function cast(characterId: string) {
    setBusy(characterId);
    setError(null);
    try {
      await gameApi(view.game.id).post("vote", { characterId });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(null);
    }
  }

  if (vote.status === "closed" && vote.result) return <VoteResult view={view} />;

  return (
    <Card tone="crimson">
      <div className="mb-2 flex items-center justify-between">
        <Title>{vote.kind === "final_vote" ? "Accusa finale" : `Votazione ${vote.roundNumber}`}</Title>
        <Badge tone="gold">
          {vote.votedCount}/{vote.eligibleCount} hanno votato
        </Badge>
      </div>
      {vote.canVote ? (
        <>
          <p className="mb-3 text-sm text-muted">
            Chi va arrestato? Puoi cambiare idea finché la votazione è aperta.
          </p>
          <ul className="flex flex-col gap-2">
            {vote.accusableIds.map((id) => {
              const selected = vote.myVoteCharacterId === id;
              return (
                <li key={id}>
                  <button
                    onClick={() => cast(id)}
                    disabled={busy !== null}
                    data-testid="vote-option"
                    className={`w-full rounded-xl border px-3 py-3 text-left transition ${selected ? "border-crimson bg-crimson/20" : "border-line bg-surface-2 hover:border-crimson/60"}`}
                  >
                    <span className="font-display text-lg">{characterLabel(view, id)}</span>
                    {selected ? <span className="ml-2 text-sm text-red-300">← il tuo voto</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-sm text-muted">La votazione è in corso sui telefoni dei giocatori.</p>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

export function VoteResult({ view, big = false }: { view: PlayerView; big?: boolean }) {
  const vote = view.vote;
  if (!vote?.result) return null;
  const { kind, characterId, tally } = vote.result;
  const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
  const headline =
    kind === "killer" ? "Colpevole arrestato!" : kind === "innocent" ? "Arrestato un innocente!" : kind === "tie" ? "Parità: nessun arresto" : "Nessun voto";
  return (
    <Card tone={kind === "killer" ? "gold" : "crimson"} className="animate-pop">
      <p className="text-xs uppercase tracking-[0.3em] text-muted">Esito della votazione</p>
      <h2 className={`font-display ${big ? "text-6xl" : "text-3xl"} mt-1 ${kind === "killer" ? "text-gold" : "text-red-300"}`}>{headline}</h2>
      {characterId ? <p className={`${big ? "text-3xl" : "text-lg"} mt-2`}>{characterLabel(view, characterId)}</p> : null}
      <ul className={`mt-3 flex flex-col gap-1 ${big ? "text-xl" : "text-sm"} text-muted`}>
        {sorted.map(([id, n]) => (
          <li key={id} className="flex justify-between">
            <span>{characterLabel(view, id)}</span>
            <span>{n} {n === 1 ? "voto" : "voti"}</span>
          </li>
        ))}
      </ul>
      {!big ? (
        <p className="mt-3 text-sm text-muted">{view.me.isHost ? "Quando siete pronti, premi “Continua” nella Regia." : "In attesa che l’host prosegua…"}</p>
      ) : null}
    </Card>
  );
}
