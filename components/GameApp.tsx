"use client";

import Link from "next/link";
import { useGameSync } from "@/lib/client/useGameSync";
import { Briefing } from "./Briefing";
import { GameView } from "./game/GameView";
import { Lobby } from "./Lobby";
import { Card, Screen } from "./ui";
import { WakeLockToggle } from "./WakeLock";

export function GameApp({ gameId }: { gameId: string }) {
  const { view, status, realtimeUp, refresh, markRead, serverNow } = useGameSync(gameId);

  if (status === "unauthorized" || status === "notfound") {
    return (
      <Screen>
        <Card className="mt-10 text-center">
          <h1 className="font-display text-2xl text-gold">{status === "notfound" ? "Partita non trovata" : "Telefono non collegato"}</h1>
          <p className="mt-2 text-sm text-muted">
            {status === "notfound"
              ? "Controlla il link o il codice."
              : "Questo telefono non è collegato alla partita (o l'host ti ha spostato su un altro dispositivo). Usa il tuo link personale, oppure chiedi all'host di generarne uno nuovo dalla Regia."}
          </p>
          <Link href="/" className="mt-4 inline-block text-gold underline">
            Torna alla home
          </Link>
        </Card>
      </Screen>
    );
  }

  if (!view) {
    return (
      <Screen>
        <p className="mt-20 animate-pulse-soft text-center text-muted">{status === "offline" ? "In attesa di connessione…" : "Caricamento…"}</p>
      </Screen>
    );
  }

  const s = view.game.status;
  return (
    <Screen>
      <ConnectionBar online={status === "live"} realtime={realtimeUp} />
      {s === "lobby" || s === "generating" ? <Lobby view={view} refresh={() => refresh("state")} /> : null}
      {s === "ready" ? <Briefing view={view} /> : null}
      {s === "in_progress" || s === "ended" ? (
        <GameView view={view} serverNow={serverNow} refresh={() => refresh("state")} markRead={markRead} />
      ) : null}
    </Screen>
  );
}

function ConnectionBar({ online, realtime }: { online: boolean; realtime: boolean }) {
  return (
    <div className="flex items-center justify-between text-xs text-muted">
      <span className="flex items-center gap-2" data-testid="connection">
        <span className={`size-2 rounded-full ${!online ? "bg-crimson" : realtime ? "bg-green" : "bg-gold"}`} />
        {!online ? "Riconnessione…" : realtime ? "Connesso" : "Connesso (aggiornamento lento)"}
      </span>
      <WakeLockToggle />
    </div>
  );
}
