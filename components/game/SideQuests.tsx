"use client";

import { useState } from "react";
import { gameApi } from "@/lib/client/api";
import type { PlayerView } from "@/lib/game/view";
import { RichText } from "../RichText";
import { Badge, Button, Card, ErrorText, Title } from "../ui";

const STATUS: Record<string, { label: string; tone: "neutral" | "gold" | "green" | "crimson" }> = {
  open: { label: "da fare", tone: "neutral" },
  claimed: { label: "in attesa di conferma", tone: "gold" },
  confirmed: { label: "completata", tone: "green" },
  rejected: { label: "smentita, riprova", tone: "crimson" },
};

export function SideQuestsPanel({ view, onChanged }: { view: PlayerView; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAct = view.game.status === "in_progress";
  async function claim(id: string) {
    setBusy(id);
    setError(null);
    try {
      await gameApi(view.game.id).post("sidequests", { sideQuestId: id, action: "claim" });
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <PendingConfirmations view={view} onChanged={onChanged} />
      <Card>
        <Title className="mb-1">Le tue missioni segrete</Title>
        <p className="mb-3 text-sm text-muted">Quando ce la fai, premi &quot;Fatto!&quot;: l&apos;altro giocatore dovrà confermare.</p>
        {view.sideQuests.length === 0 ? <p className="text-sm text-muted">Nessuna missione in questa partita.</p> : null}
        <ul className="flex flex-col gap-3">
          {view.sideQuests.map((sq) => (
            <li key={sq.id} className="rounded-xl bg-surface-2 p-3" data-testid="sidequest">
              <div className="mb-1 flex items-center justify-between">
                <Badge tone={STATUS[sq.status].tone}>{STATUS[sq.status].label}</Badge>
                <span className="text-xs text-gold">+{sq.points} punti</span>
              </div>
              <p className="text-sm">
                <RichText text={sq.description} view={view} />
              </p>
              {canAct && (sq.status === "open" || sq.status === "rejected") ? (
                <Button className="mt-2 w-full" variant="secondary" onClick={() => claim(sq.id)} loading={busy === sq.id}>
                  Fatto!
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        <ErrorText>{error}</ErrorText>
      </Card>
    </>
  );
}

export function PendingConfirmations({ view, onChanged }: { view: PlayerView; onChanged: () => void }) {
  if (!view.pendingConfirmations.length) return null;
  return (
    <Card tone="gold">
      <Title className="mb-3">Ti chiedono una conferma</Title>
      <div className="flex flex-col gap-3">
        {view.pendingConfirmations.map((c) => (
          <ConfirmationCard key={c.sideQuestId} view={view} confirmation={c} onDone={onChanged} />
        ))}
      </div>
    </Card>
  );
}

export function ConfirmationCard({
  view,
  confirmation,
  onDone,
}: {
  view: PlayerView;
  confirmation: PlayerView["pendingConfirmations"][number];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function answer(action: "confirm" | "reject") {
    setBusy(true);
    setError(null);
    try {
      await gameApi(view.game.id).post("sidequests", { sideQuestId: confirmation.sideQuestId, action });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border border-gold/50 bg-gold/5 p-3" data-testid="confirmation">
      <p className="text-xs text-muted">🤝 Missione di un altro giocatore</p>
      <p className="mt-1">
        <RichText text={confirmation.prompt} view={view} />
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button onClick={() => answer("confirm")} disabled={busy}>
          Sì, confermo
        </Button>
        <Button variant="secondary" onClick={() => answer("reject")} disabled={busy}>
          No
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
