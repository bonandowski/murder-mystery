"use client";

import { useEffect, useRef, useState } from "react";

type Sentinel = { release: () => Promise<void> };

/** Facoltativo: tiene lo schermo acceso. La partita resta stabile anche senza. */
export function WakeLockToggle() {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const sentinel = useRef<Sentinel | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported("wakeLock" in navigator);
  }, []);

  useEffect(() => {
    if (!on) return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    const acquire = async () => {
      try {
        sentinel.current = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        setOn(false);
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel.current?.release();
      sentinel.current = null;
    };
  }, [on]);

  if (!supported) return null;
  return (
    <button onClick={() => setOn((v) => !v)} className={on ? "text-gold" : "text-muted"}>
      {on ? "☀ Schermo sempre acceso" : "Tieni schermo acceso"}
    </button>
  );
}
