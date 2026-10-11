"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { saveSession } from "@/lib/client/session";
import { Button, Card, ErrorText, inputClass, Label, Screen, Title } from "../ui";

export function TvJoinForm({ initialCode }: { initialCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ gameId: string; token: string }>("/api/games/join", {
        body: { code, nickname: "Schermo TV", spectator: true },
      });
      saveSession(res.gameId, res.token);
      router.push(`/tv/${res.gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
      setLoading(false);
    }
  }
  return (
    <Screen>
      <Card className="mt-10">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Title>Schermo condiviso</Title>
          <p className="text-sm text-muted">
            Collega una TV, un tablet o un portatile: mostrerà narrazione, timer e votazioni a tutto il tavolo. Non vede
            nessun segreto.
          </p>
          <label>
            <Label>Codice partita</Label>
            <input
              className={`${inputClass} font-mono text-lg uppercase tracking-[0.3em]`}
              value={code}
              maxLength={8}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <Button type="submit" loading={loading} disabled={code.length < 4}>
            Collega schermo
          </Button>
          <ErrorText>{error}</ErrorText>
        </form>
      </Card>
    </Screen>
  );
}
