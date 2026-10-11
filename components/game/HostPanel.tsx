"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { ApiError, gameApi } from "@/lib/client/api";
import { personalLink } from "@/lib/client/session";
import type { PlayerView } from "@/lib/game/view";
import { Badge, Button, Card, ErrorText, Title } from "../ui";
import { currentPhase, phaseClock } from "./shared";

type Action = "next" | "extend" | "pause" | "resume" | "close_vote" | "end";

export function HostPanel({ view, nowMs, onChanged }: { view: PlayerView; nowMs: number; onChanged: () => void }) {
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const phase = currentPhase(view);
  const clock = phaseClock(view, nowMs);
  const ended = view.game.status === "ended";
  const voteOpen = view.vote?.status === "open";

  async function act(action: Action) {
    if (action === "end" && !confirm("Terminare la partita e rivelare la soluzione?")) return;
    setBusy(action);
    setError(null);
    try {
      await gameApi(view.game.id).post("control", { action, version: view.game.version });
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        onChanged();
        setError("Lo stato era cambiato: controlla e riprova.");
      } else setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setBusy(null);
    }
  }

  const nextLabel = voteOpen
    ? "Chiudi votazione"
    : phase?.kind === "final_vote" || phase?.kind === "showdown"
      ? "Vai all'epilogo"
      : "Passa alla fase successiva";

  return (
    <>
      <Card tone="gold">
        <Title>Regia</Title>
        <p className="mt-1 text-sm text-muted">
          {phase?.title}
          {clock?.expired && !ended ? <span className="text-red-300"> · tempo scaduto, tocca a te</span> : null}
        </p>
        {!ended ? (
          <div className="mt-3 flex flex-col gap-2">
            <Button onClick={() => act("next")} loading={busy === "next"} variant={clock?.expired || view.vote?.status === "closed" ? "primary" : "secondary"} data-testid="host-next">
              {nextLabel}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => act("extend")} loading={busy === "extend"}>
                +5 minuti
              </Button>
              {view.game.pausedAt ? (
                <Button variant="secondary" onClick={() => act("resume")} loading={busy === "resume"}>
                  ▶ Riprendi
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => act("pause")} loading={busy === "pause"}>
                  ⏸ Pausa
                </Button>
              )}
            </div>
            <Button variant="ghost" onClick={() => act("end")} loading={busy === "end"}>
              Termina e rivela la soluzione
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-sm">Partita conclusa.</p>
        )}
        <ErrorText>{error}</ErrorText>
        <p className="mt-3 text-xs text-muted">
          Se il tuo telefono resta bloccato, allo scadere del tempo la partita prosegue da sola dopo qualche minuto.
        </p>
      </Card>
      <Card>
        <Title className="mb-2">Andamento</Title>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            Missioni completate: {view.sideQuestStats.confirmed}/{view.sideQuestStats.total}
          </li>
          {view.vote ? (
            <li>
              Voti: {view.vote.votedCount}/{view.vote.eligibleCount}
            </li>
          ) : null}
        </ul>
      </Card>
      <DevicesCard view={view} onChanged={onChanged} />
    </>
  );
}

function DevicesCard({ view, onChanged }: { view: PlayerView; onChanged: () => void }) {
  const [link, setLink] = useState<{ nickname: string; url: string } | null>(null);
  const [tvUrl, setTvUrl] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setTvUrl(`${window.location.origin}/tv?code=${view.game.code}`), [view.game.code]);

  async function reassign(playerId: string, nickname: string) {
    if (!confirm(`Spostare ${nickname} su un nuovo telefono? Il vecchio verrà scollegato.`)) return;
    const res = await gameApi(view.game.id).post<{ token: string }>("players", { action: "reassign", playerId });
    setLink({ nickname, url: personalLink(res.token) });
    onChanged();
  }

  return (
    <Card>
      <Title className="mb-2">Telefoni</Title>
      <ul className="flex flex-col gap-2">
        {view.players
          .filter((p) => !p.isSpectator)
          .map((p) => (
            <li key={p.id} className="flex items-center gap-3 text-sm">
              <span className={`size-2.5 rounded-full ${p.online ? "bg-green" : "bg-line"}`} />
              <span className="flex-1">{p.nickname}</span>
              {p.isHost ? <Badge tone="gold">host</Badge> : (
                <button className="text-xs text-gold underline" onClick={() => reassign(p.id, p.nickname)}>
                  nuovo telefono
                </button>
              )}
            </li>
          ))}
      </ul>
      {link ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-surface-2 p-3 text-center">
          <p className="text-sm">Fai inquadrare questo QR a {link.nickname} dal nuovo telefono:</p>
          <div className="rounded-lg bg-white p-2">
            <QRCodeSVG value={link.url} size={160} />
          </div>
          <Button variant="ghost" onClick={() => setLink(null)}>
            Chiudi
          </Button>
        </div>
      ) : null}
      {tvUrl ? (
        <p className="mt-3 text-xs text-muted">
          Schermo condiviso: apri <span className="text-gold">{tvUrl.replace(/^https?:\/\//, "")}</span> su TV o tablet.
        </p>
      ) : null}
    </Card>
  );
}
