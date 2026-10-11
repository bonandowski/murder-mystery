"use client";

import { useState } from "react";
import { gameApi } from "@/lib/client/api";
import type { PlayerView } from "@/lib/game/view";
import { runGeneration } from "./Lobby";
import { PersonalLink } from "./PersonalLink";
import { RichText } from "./RichText";
import { Badge, Button, Card, ErrorText, Label, Title } from "./ui";

/** Pre-serata: storia e personaggi pubblici visibili, segreti ancora chiusi. */
export function Briefing({ view }: { view: PlayerView }) {
  const me = view.characters.find((c) => c.id === view.me.characterId);
  const s = view.scenario;
  return (
    <>
      {s ? (
        <Card tone="gold">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">Il mistero di stasera</p>
          <h1 className="font-display mt-1 text-3xl text-gold">{s.title}</h1>
          <p className="mt-3 text-sm"><RichText text={s.setting} view={view} /></p>
          <p className="mt-2 text-sm text-muted"><RichText text={s.premise} view={view} /></p>
          {s.dressCode ? (
            <p className="mt-3 text-sm">
              <span className="text-muted">Dress code: </span>
              {s.dressCode}
            </p>
          ) : null}
        </Card>
      ) : null}
      {me ? (
        <Card tone="crimson">
          <Label>Il tuo personaggio</Label>
          <h2 className="font-display text-2xl">{me.name}</h2>
          <p className="text-sm text-gold">{me.role}</p>
          <p className="mt-2 text-sm"><RichText text={me.publicDescription} view={view} /></p>
          {me.look ? (
            <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
              <span className="text-muted">Costume consigliato: </span>
              {me.look}
            </p>
          ) : null}
          <p className="mt-3 text-sm text-muted">🔒 Segreti, alibi e obiettivi si sbloccano quando l&apos;host dà inizio alla serata.</p>
        </Card>
      ) : null}
      <CastList view={view} />
      {view.me.isHost ? <HostStart view={view} /> : (
        <Card><p className="text-sm text-muted">In attesa che l&apos;host dia inizio alla serata…</p></Card>
      )}
      <PersonalLink gameId={view.game.id} />
    </>
  );
}

export function CastList({ view }: { view: PlayerView }) {
  return (
    <Card>
      <Title className="mb-3">I sospettati</Title>
      <ul className="flex flex-col gap-3">
        {view.characters.map((c) => {
          const nick = view.players.find((p) => p.id === c.playerId)?.nickname;
          return (
            <li key={c.id} className="rounded-xl bg-surface-2 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-display text-lg">{c.name}</span>
                {c.arrestStatus === "killer" ? <Badge tone="crimson">arrestato · colpevole</Badge> : null}
                {c.arrestStatus === "exonerated" ? <Badge tone="green">scagionato</Badge> : null}
              </div>
              <p className="text-xs text-gold">
                {c.role}
                {nick ? <span className="text-muted"> · interpretato da {nick}</span> : null}
              </p>
              <p className="mt-1 text-sm text-muted"><RichText text={c.publicDescription} view={view} /></p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function HostStart({ view }: { view: PlayerView }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start() {
    setLoading(true);
    setError(null);
    try {
      await gameApi(view.game.id).post("start");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
      setLoading(false);
    }
  }
  async function regenerate() {
    if (!confirm("Rigenerare tutta la storia? I personaggi attuali andranno persi.")) return;
    setLoading(true);
    try {
      await runGeneration(view.game.id, 1, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setLoading(false);
    }
  }
  async function backToLobby() {
    if (!confirm("Tornare alla lobby? La storia verrà cancellata e potrai cambiare invitati.")) return;
    await gameApi(view.game.id).post("generate", { cancel: true });
  }
  const online = view.players.filter((p) => !p.isSpectator && p.online).length;
  const total = view.players.filter((p) => !p.isSpectator).length;
  return (
    <Card tone="gold">
      <Title>Regia</Title>
      <p className="mt-1 text-sm text-muted">
        Online ora: {online}/{total}. Quando siete tutti a tavola, dai il via: ognuno riceverà i propri segreti.
      </p>
      <Button className="mt-3 w-full" onClick={start} loading={loading}>
        Inizia la serata
      </Button>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={regenerate} disabled={loading}>
          Rigenera storia
        </Button>
        <Button variant="secondary" onClick={backToLobby} disabled={loading}>
          Torna alla lobby
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
