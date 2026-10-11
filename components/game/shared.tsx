"use client";

import { computeClock, type Clock } from "@/lib/game/engine";
import type { PlayerView } from "@/lib/game/view";

export function currentPhase(view: PlayerView) {
  return view.phases.find((p) => p.idx === view.game.currentPhaseIdx) ?? null;
}

export function phaseClock(view: PlayerView, nowMs: number): Clock | null {
  const phase = currentPhase(view);
  if (!phase) return null;
  return computeClock(
    {
      phaseStartedAt: view.game.phaseStartedAt,
      pausedAt: view.game.pausedAt,
      pausedTotalSeconds: view.game.pausedTotalSeconds,
      phaseExtraSeconds: view.game.phaseExtraSeconds,
      targetSeconds: phase.targetSeconds,
    },
    nowMs,
  );
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export function TimerText({ clock, big = false }: { clock: Clock | null; big?: boolean }) {
  if (!clock) return null;
  const overtime = clock.expired;
  return (
    <span
      className={`font-mono tabular-nums ${big ? "text-7xl" : "text-lg"} ${clock.paused ? "text-muted" : overtime ? "text-red-300" : "text-gold"}`}
      data-testid="timer"
    >
      {clock.paused ? "⏸ " : ""}
      {overtime ? "0:00" : formatTime(clock.remaining)}
    </span>
  );
}

export const KIND_STYLE: Record<string, { icon: string; label: string }> = {
  narration: { icon: "📜", label: "Narrazione" },
  hint: { icon: "💡", label: "Suggerimento" },
  clue: { icon: "🔎", label: "Indizio" },
  event: { icon: "⚡", label: "Evento" },
  killer_tip: { icon: "🗡️", label: "Solo per te, assassino" },
  system: { icon: "⏰", label: "Regia" },
  reveal: { icon: "🚨", label: "Colpo di scena" },
  sq_confirm_request: { icon: "🤝", label: "Conferma richiesta" },
  sq_result: { icon: "🎯", label: "Missione" },
};

export function unreadMessages(view: PlayerView) {
  const readAt = view.me.inboxReadAt ? Date.parse(view.me.inboxReadAt) : 0;
  return view.messages.filter((m) => Date.parse(m.releasedAt) > readAt);
}
