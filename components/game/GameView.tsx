"use client";

import { useState } from "react";
import { isVotePhase } from "@/lib/game/engine";
import type { PlayerView } from "@/lib/game/view";
import { useTicker } from "@/lib/client/useGameSync";
import { RichText } from "../RichText";
import { Card } from "../ui";
import { CharacterSheet } from "./CharacterSheet";
import { Epilogue } from "./Epilogue";
import { HostPanel } from "./HostPanel";
import { MessageCard } from "./MessageCard";
import { MessagePopup } from "./MessagePopup";
import { currentPhase, phaseClock, TimerText, unreadMessages } from "./shared";
import { PendingConfirmations, SideQuestsPanel } from "./SideQuests";
import { VotePanel } from "./VotePanel";

type Tab = "now" | "sheet" | "inbox" | "quests" | "host";

export function GameView({
  view,
  serverNow,
  refresh,
  markRead,
}: {
  view: PlayerView;
  serverNow: () => number;
  refresh: () => void;
  markRead: (upTo: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("now");
  useTicker(1000);
  const nowMs = serverNow();
  const phase = currentPhase(view);
  const clock = phaseClock(view, nowMs);
  const ended = view.game.status === "ended";
  const unread = unreadMessages(view).length;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "now", label: "Ora" },
    { id: "sheet", label: "Scheda" },
    { id: "inbox", label: "Messaggi", badge: unread },
    ...(view.sideQuests.length ? [{ id: "quests" as Tab, label: "Missioni", badge: view.pendingConfirmations.length }] : []),
    ...(view.me.isHost ? [{ id: "host" as Tab, label: "Regia" }] : []),
  ];

  return (
    <>
      <div className="sticky top-0 z-30 -mx-4 border-b border-line bg-bg/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs uppercase tracking-widest text-muted">{view.scenario?.title}</p>
            <p className="font-display truncate text-lg" data-testid="phase-title">
              {phase?.title ?? ""}
            </p>
          </div>
          {!ended ? <TimerText clock={clock} /> : null}
        </div>
      </div>

      {tab === "now" ? <NowTab view={view} refresh={refresh} /> : null}
      {tab === "sheet" ? <CharacterSheet view={view} /> : null}
      {tab === "inbox" ? <Inbox view={view} /> : null}
      {tab === "quests" ? <SideQuestsPanel view={view} onChanged={refresh} /> : null}
      {tab === "host" ? <HostPanel view={view} nowMs={nowMs} onChanged={refresh} /> : null}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => setTab(t.id)}
                data-testid={`tab-${t.id}`}
                className={`relative flex h-14 w-full items-center justify-center text-sm ${tab === t.id ? "text-gold" : "text-muted"}`}
              >
                {t.label}
                {t.badge ? (
                  <span className="absolute right-2 top-2 min-w-5 rounded-full bg-crimson px-1.5 text-xs text-white">{t.badge}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <MessagePopup view={view} onRead={markRead} onChanged={refresh} />
    </>
  );
}

function NowTab({ view, refresh }: { view: PlayerView; refresh: () => void }) {
  const phase = currentPhase(view);
  if (view.game.status === "ended") return <Epilogue view={view} />;
  const phaseMessages = view.messages.filter((m) => m.phaseIdx === view.game.currentPhaseIdx);
  const narration = [...phaseMessages].reverse().find((m) => m.kind === "narration" || m.kind === "reveal");
  const recent = [...view.messages].reverse().filter((m) => m.private).slice(0, 3);
  return (
    <>
      {view.game.pausedAt ? (
        <Card className="text-center text-muted">⏸ Gioco in pausa</Card>
      ) : null}
      {phase && isVotePhase(phase.kind) ? <VotePanel view={view} onChanged={refresh} /> : null}
      {narration ? <MessageCard view={view} message={narration} /> : null}
      {phase?.kind === "prologue" ? (
        <Card>
          <p className="text-sm">
            Apri la tab <strong>Scheda</strong>: lì trovi la tua storia, il tuo segreto e i tuoi obiettivi. Presentati agli altri
            restando nel personaggio!
          </p>
        </Card>
      ) : null}
      <PendingConfirmations view={view} onChanged={refresh} />
      {recent.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs uppercase tracking-widest text-muted">Ultimi messaggi per te</h3>
          {recent.map((m) => (
            <MessageCard key={m.id} view={view} message={m} compact />
          ))}
        </section>
      ) : null}
      {view.scenario ? (
        <Card>
          <p className="text-xs uppercase tracking-widest text-muted">La vittima</p>
          <p className="font-display text-lg">{view.scenario.victimName}</p>
          <p className="text-sm text-muted"><RichText text={view.scenario.victimDescription} view={view} /></p>
        </Card>
      ) : null}
    </>
  );
}

function Inbox({ view }: { view: PlayerView }) {
  const all = [...view.messages].reverse();
  return (
    <section className="flex flex-col gap-2">
      {all.length === 0 ? <Card className="text-sm text-muted">Ancora nessun messaggio.</Card> : null}
      {all.map((m) => (
        <MessageCard key={m.id} view={view} message={m} compact />
      ))}
    </section>
  );
}
