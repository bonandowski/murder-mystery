"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerView } from "@/lib/game/view";
import { ApiError, apiFetch } from "./api";
import { getToken } from "./session";
import { realtimeClient } from "./supabase";

export type SyncStatus = "connecting" | "live" | "offline" | "unauthorized" | "notfound";

const HEARTBEAT_MS = 20_000;

/**
 * Tiene il telefono allineato con il server, anche dopo blocco schermo o rete ballerina:
 * - lo stato arriva SEMPRE dalle API (fonte di verità), mai ricostruito sul client;
 * - Supabase Realtime manda solo ping "è cambiato qualcosa" → rilettura dello stato;
 * - heartbeat ogni 20s (tick) come rete di sicurezza se il websocket muore;
 * - risincronizzazione su visibilitychange / focus / online / pageshow;
 * - tick puntuale al prossimo rilascio di messaggi e allo scadere della fase.
 */
export function useGameSync(gameId: string) {
  const [view, setView] = useState<PlayerView | null>(null);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [realtimeUp, setRealtimeUp] = useState(false);
  const offsetRef = useRef(0);
  const inflight = useRef(false);
  const queued = useRef<"tick" | "state" | null>(null);
  const readUpToRef = useRef<string | null>(null);

  const refresh = useCallback(
    async (mode: "tick" | "state" = "state") => {
      if (!getToken(gameId)) {
        setStatus("unauthorized");
        return;
      }
      // Una richiesta alla volta; le richieste arrivate nel frattempo si accodano (un tick vince su uno state).
      if (inflight.current) {
        queued.current = queued.current === "tick" || mode === "tick" ? "tick" : "state";
        return;
      }
      inflight.current = true;
      let current: "tick" | "state" | null = mode;
      try {
        while (current) {
          queued.current = null;
          try {
            const t0 = Date.now();
            const next =
              current === "tick"
                ? await apiFetch<PlayerView>(`/api/games/${gameId}/tick`, {
                    method: "POST",
                    body: { readUpTo: readUpToRef.current },
                    gameId,
                  })
                : await apiFetch<PlayerView>(`/api/games/${gameId}/state`, { gameId });
            const t1 = Date.now();
            offsetRef.current = next.serverNow - (t0 + t1) / 2;
            setView(next);
            setStatus("live");
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) setStatus("unauthorized");
            else if (err instanceof ApiError && err.status === 404) setStatus("notfound");
            else setStatus("offline");
          }
          current = queued.current;
        }
      } finally {
        inflight.current = false;
      }
    },
    [gameId],
  );

  // Primo caricamento + heartbeat + eventi di ritorno in primo piano.
  useEffect(() => {
    queueMicrotask(() => void refresh("tick"));
    const beat = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh("tick");
    }, HEARTBEAT_MS);
    const wake = () => {
      if (document.visibilityState === "visible") void refresh("tick");
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    return () => {
      window.clearInterval(beat);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("pageshow", wake);
    };
  }, [refresh]);

  // Ping realtime con riconnessione a backoff.
  useEffect(() => {
    const client = realtimeClient();
    if (!client) return;
    let channel: RealtimeChannel | null = null;
    let retry = 0;
    let retryTimer: number | undefined;
    let debounce: number | undefined;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      channel = client
        .channel(`game:${gameId}`)
        .on("broadcast", { event: "changed" }, () => {
          window.clearTimeout(debounce);
          debounce = window.setTimeout(() => void refresh("state"), 120);
        })
        .subscribe((s) => {
          if (disposed) return;
          if (s === "SUBSCRIBED") {
            retry = 0;
            setRealtimeUp(true);
            void refresh("state"); // recupera ciò che è successo mentre eravamo scollegati
          } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
            setRealtimeUp(false);
            const ch = channel;
            channel = null;
            if (ch) void client.removeChannel(ch);
            window.clearTimeout(retryTimer);
            retryTimer = window.setTimeout(connect, Math.min(30_000, 1000 * 2 ** retry++));
          }
        });
    };
    connect();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!channel || channel.state !== "joined") {
        const ch = channel;
        channel = null;
        if (ch) void client.removeChannel(ch);
        window.clearTimeout(retryTimer);
        retry = 0;
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(retryTimer);
      window.clearTimeout(debounce);
      if (channel) void client.removeChannel(channel);
    };
  }, [gameId, refresh]);

  // Tick puntuali: prossimo messaggio programmato e scadenza della fase.
  useEffect(() => {
    if (!view || view.game.status !== "in_progress") return;
    const now = Date.now() + offsetRef.current;
    const targets: number[] = [];
    if (view.nextReleaseAt) targets.push(view.nextReleaseAt);
    const phase = view.phases.find((p) => p.idx === view.game.currentPhaseIdx);
    if (phase && view.game.phaseStartedAt && !view.game.pausedAt) {
      targets.push(
        Date.parse(view.game.phaseStartedAt) +
          (view.game.pausedTotalSeconds + phase.targetSeconds + view.game.phaseExtraSeconds) * 1000,
      );
    }
    const upcoming = targets.filter((t) => t > now - 1000).sort((a, b) => a - b)[0];
    if (!upcoming) return;
    const timer = window.setTimeout(() => void refresh("tick"), Math.max(250, upcoming - now + 400));
    return () => window.clearTimeout(timer);
  }, [view, refresh]);

  const markRead = useCallback(
    (upTo: string) => {
      readUpToRef.current = upTo;
      setView((v) => (v ? { ...v, me: { ...v.me, inboxReadAt: upTo } } : v));
      void refresh("tick");
    },
    [refresh],
  );

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { view, status, realtimeUp, refresh, markRead, serverNow };
}

export function useTicker(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
