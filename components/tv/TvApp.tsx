"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { isVotePhase } from "@/lib/game/engine";
import type { PlayerView } from "@/lib/game/view";
import { useGameSync, useTicker } from "@/lib/client/useGameSync";
import { Epilogue } from "../game/Epilogue";
import { currentPhase, phaseClock, TimerText } from "../game/shared";
import { VoteResult } from "../game/VotePanel";
import { characterLabel, RichText } from "../RichText";

/** Vista per TV/tablet: solo informazioni pubbliche, caratteri grandi. */
export function TvApp({ gameId }: { gameId: string }) {
  const { view, status, serverNow } = useGameSync(gameId);
  useTicker(1000);
  if (status === "unauthorized" || status === "notfound") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-2xl">Schermo non collegato.</p>
        <Link href="/tv" className="text-gold underline">Collega di nuovo</Link>
      </main>
    );
  }
  if (!view) return <main className="flex min-h-dvh items-center justify-center text-2xl text-muted">Caricamento…</main>;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 p-6 md:p-10">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-3xl text-gold md:text-5xl">{view.scenario?.title ?? "Cena con Delitto"}</h1>
        <span className="font-mono text-xl text-muted">{view.game.code}</span>
      </header>
      <TvBody view={view} nowMs={serverNow()} />
    </main>
  );
}

function TvBody({ view, nowMs }: { view: PlayerView; nowMs: number }) {
  const s = view.game.status;
  if (s === "lobby" || s === "generating") return <TvLobby view={view} />;
  if (s === "ready") return <TvCast view={view} heading="Stasera, a cena…" />;
  if (s === "ended") {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Epilogue view={view} big />
      </div>
    );
  }
  const phase = currentPhase(view);
  const clock = phaseClock(view, nowMs);
  const publicMessages = view.messages.filter((m) => !m.private);
  const latest = [...publicMessages].reverse().find((m) => m.phaseIdx === view.game.currentPhaseIdx) ?? publicMessages[publicMessages.length - 1];
  const arrested = view.characters.filter((c) => c.arrestStatus);
  return (
    <div className="grid flex-1 gap-8 md:grid-cols-[1fr_auto]">
      <section className="flex flex-col gap-6">
        <p className="font-display text-4xl md:text-6xl" data-testid="tv-phase">{phase?.title}</p>
        {phase && isVotePhase(phase.kind) && view.vote ? (
          view.vote.status === "closed" ? (
            <VoteResult view={view} big />
          ) : (
            <p className="text-3xl text-red-300">
              Votazione in corso: {view.vote.votedCount}/{view.vote.eligibleCount} hanno votato
            </p>
          )
        ) : null}
        {latest ? (
          <article className="animate-pop rounded-3xl border border-line bg-surface/80 p-6 md:p-8">
            {latest.title ? <h2 className="font-display text-3xl text-gold"><RichText text={latest.title} view={view} /></h2> : null}
            <p className="mt-3 text-2xl leading-relaxed md:text-3xl"><RichText text={latest.body} view={view} /></p>
          </article>
        ) : null}
      </section>
      <aside className="flex flex-col items-center gap-6 md:min-w-72">
        <TimerText clock={clock} big />
        {view.game.pausedAt ? <p className="text-2xl text-muted">In pausa</p> : null}
        {view.sideQuestStats.total ? (
          <p className="text-xl text-muted">
            Missioni segrete: {view.sideQuestStats.confirmed}/{view.sideQuestStats.total}
          </p>
        ) : null}
        {arrested.length ? (
          <ul className="w-full text-lg">
            {arrested.map((c) => (
              <li key={c.id} className={c.arrestStatus === "killer" ? "text-gold" : "text-green-300"}>
                {c.arrestStatus === "killer" ? "🔒" : "✓"} {characterLabel(view, c.id)}
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    </div>
  );
}

function TvLobby({ view }: { view: PlayerView }) {
  const [url, setUrl] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setUrl(`${window.location.origin}/join/${view.game.code}`), [view.game.code]);
  const players = view.players.filter((p) => !p.isSpectator);
  return (
    <div className="grid flex-1 items-center gap-10 md:grid-cols-2">
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-3xl bg-white p-4">{url ? <QRCodeSVG value={url} size={280} /> : null}</div>
        <p className="font-mono text-6xl tracking-[0.3em] text-gold">{view.game.code}</p>
        <p className="text-xl text-muted">Inquadra il QR o inserisci il codice</p>
      </div>
      <div>
        <h2 className="font-display mb-4 text-4xl">Invitati ({players.length})</h2>
        <ul className="grid grid-cols-2 gap-3 text-2xl">
          {players.map((p) => (
            <li key={p.id} className="animate-pop rounded-2xl bg-surface-2 px-4 py-3">{p.nickname}</li>
          ))}
        </ul>
        {view.game.status === "generating" ? (
          <p className="mt-6 animate-pulse-soft text-2xl text-gold">Il mistero sta prendendo forma…</p>
        ) : null}
      </div>
    </div>
  );
}

function TvCast({ view, heading }: { view: PlayerView; heading: string }) {
  return (
    <div className="flex flex-col gap-6">
      {view.scenario ? <p className="max-w-4xl text-2xl text-muted"><RichText text={view.scenario.premise} view={view} /></p> : null}
      <h2 className="font-display text-4xl">{heading}</h2>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {view.characters.map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-surface/80 p-5">
            <p className="font-display text-2xl text-gold">{c.name}</p>
            <p className="text-lg">{c.role}</p>
            <p className="text-muted">{view.players.find((p) => p.id === c.playerId)?.nickname}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
