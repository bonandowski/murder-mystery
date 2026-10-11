"use client";

import type { PlayerView } from "@/lib/game/view";
import { Button } from "../ui";
import { MessageCard } from "./MessageCard";
import { ConfirmationCard } from "./SideQuests";
import { unreadMessages } from "./shared";

/** Popup in-app per i messaggi arrivati (anche quelli persi mentre il telefono era bloccato). */
export function MessagePopup({ view, onRead, onChanged }: { view: PlayerView; onRead: (upTo: string) => void; onChanged: () => void }) {
  if (view.me.isSpectator) return null;
  const unread = unreadMessages(view);
  if (!unread.length) return null;
  const latest = unread[unread.length - 1].releasedAt;
  const pendingIds = new Set(view.pendingConfirmations.map((p) => p.sideQuestId));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="animate-pop flex max-h-[85dvh] w-full max-w-md flex-col gap-3 rounded-2xl border border-gold/50 bg-surface p-4 shadow-2xl">
        <h2 className="font-display text-xl text-gold">
          {unread.length > 2 ? `Mentre eri via: ${unread.length} messaggi` : unread.length === 2 ? "Due nuovi messaggi" : "Nuovo messaggio"}
        </h2>
        <div className="flex flex-col gap-3 overflow-y-auto">
          {[...unread].reverse().map((m) =>
            m.kind === "sq_confirm_request" && pendingIds.has(String(m.payload.sideQuestId)) ? (
              <ConfirmationCard
                key={m.id}
                view={view}
                confirmation={view.pendingConfirmations.find((p) => p.sideQuestId === m.payload.sideQuestId)!}
                onDone={onChanged}
              />
            ) : (
              <MessageCard key={m.id} view={view} message={m} />
            ),
          )}
        </div>
        <Button onClick={() => onRead(latest)} data-testid="popup-ack">
          {unread.length > 1 ? "Ho letto tutto" : "Ho letto"}
        </Button>
      </div>
    </div>
  );
}
