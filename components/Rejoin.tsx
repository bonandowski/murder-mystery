"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { saveSession } from "@/lib/client/session";
import { Card, Screen } from "./ui";

export function Rejoin({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiFetch<{ gameId: string }>("/api/rejoin", { body: { token } })
      .then(({ gameId }) => {
        saveSession(gameId, token);
        router.replace(`/g/${gameId}`);
      })
      .catch((err: Error) => setError(err.message));
  }, [token, router]);
  return (
    <Screen>
      <Card className="mt-10 text-center">
        {error ? (
          <>
            <p className="text-red-200">{error}</p>
            <Link href="/" className="mt-3 inline-block text-gold underline">Torna alla home</Link>
          </>
        ) : (
          <p className="animate-pulse-soft text-muted">Ti stiamo riportando nella partita…</p>
        )}
      </Card>
    </Screen>
  );
}
