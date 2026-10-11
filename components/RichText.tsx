"use client";

import { Fragment } from "react";
import type { PlayerView } from "@/lib/game/view";

/** Rende i token {{Ck}} come "Nome (giocatore)", così si sa subito a chi rivolgersi. */
export function RichText({ text, view, className = "" }: { text: string; view: PlayerView; className?: string }) {
  const parts = text.split(/(\{\{C\d+\}\})/g);
  return (
    <span className={`whitespace-pre-line ${className}`}>
      {parts.map((part, i) => {
        const m = part.match(/^\{\{(C\d+)\}\}$/);
        if (!m) return <Fragment key={i}>{part}</Fragment>;
        const c = view.characters.find((ch) => ch.key === m[1]);
        if (!c) return <Fragment key={i}>qualcuno</Fragment>;
        const isMe = c.id === view.me.characterId;
        const nick = view.players.find((p) => p.id === c.playerId)?.nickname;
        return (
          <span key={i} className="font-semibold text-gold">
            {isMe ? "te" : c.name}
            {!isMe && nick ? <span className="font-normal text-muted"> ({nick})</span> : null}
          </span>
        );
      })}
    </span>
  );
}

export function characterLabel(view: PlayerView, characterId: string | null): string {
  const c = view.characters.find((ch) => ch.id === characterId);
  if (!c) return "—";
  const nick = view.players.find((p) => p.id === c.playerId)?.nickname;
  return nick ? `${c.name} (${nick})` : c.name;
}
