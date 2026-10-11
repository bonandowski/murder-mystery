"use client";

import type { PlayerView } from "@/lib/game/view";
import { RichText } from "../RichText";
import { KIND_STYLE } from "./shared";

export function MessageCard({ view, message, compact = false }: { view: PlayerView; message: PlayerView["messages"][number]; compact?: boolean }) {
  const style = KIND_STYLE[message.kind] ?? KIND_STYLE.hint;
  const highlight =
    message.kind === "killer_tip" || message.kind === "reveal"
      ? "border-crimson/60 bg-crimson/10"
      : message.kind === "clue"
        ? "border-gold/50 bg-gold/5"
        : "border-line bg-surface-2";
  const time = new Date(message.releasedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return (
    <article className={`rounded-xl border p-3 ${highlight}`} data-testid="message">
      <header className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>
          {style.icon} {style.label}
          {message.private ? " · privato" : ""}
        </span>
        <time>{time}</time>
      </header>
      {message.title ? <h3 className="font-display mt-1 text-lg">{<RichText text={message.title} view={view} />}</h3> : null}
      <p className={`mt-1 ${compact ? "text-sm" : "text-base"} leading-relaxed`}>
        <RichText text={message.body} view={view} />
      </p>
    </article>
  );
}
