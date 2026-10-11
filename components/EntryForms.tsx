"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client/api";
import { getLastGame, saveSession } from "@/lib/client/session";
import { Button, Card, ErrorText, inputClass, Label, Segmented, Title } from "./ui";

type Pref = "m" | "f" | "any";
const PREFS: { value: Pref; label: string }[] = [
  { value: "any", label: "Indifferente" },
  { value: "f", label: "Donna" },
  { value: "m", label: "Uomo" },
];

function ProfileFields({
  nickname,
  setNickname,
  pref,
  setPref,
}: {
  nickname: string;
  setNickname: (v: string) => void;
  pref: Pref;
  setPref: (v: Pref) => void;
}) {
  return (
    <>
      <label className="block">
        <Label>Il tuo nome</Label>
        <input
          className={inputClass}
          value={nickname}
          maxLength={24}
          autoComplete="nickname"
          placeholder="Es. Giulia"
          onChange={(e) => setNickname(e.target.value)}
        />
      </label>
      <div>
        <Label>Personaggio preferito (per il costume)</Label>
        <Segmented value={pref} options={PREFS} onChange={setPref} />
      </div>
    </>
  );
}

export function CreateGameForm() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [pref, setPref] = useState<Pref>("any");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ gameId: string; token: string }>("/api/games", { body: { nickname, pref } });
      saveSession(res.gameId, res.token);
      router.push(`/g/${res.gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
      setLoading(false);
    }
  }

  return (
    <Card tone="gold">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Title>Organizza una cena</Title>
        <p className="text-sm text-muted">Sarai l&apos;host: inviti gli amici, scegli l&apos;ambientazione e dai il via alla serata. Giochi anche tu, senza conoscere la soluzione.</p>
        <ProfileFields nickname={nickname} setNickname={setNickname} pref={pref} setPref={setPref} />
        <Button type="submit" loading={loading} disabled={!nickname.trim()}>
          Crea partita
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}

export function JoinGameForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [nickname, setNickname] = useState("");
  const [pref, setPref] = useState<Pref>("any");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ gameId: string; token: string }>("/api/games/join", {
        body: { code, nickname, pref, spectator: false },
      });
      saveSession(res.gameId, res.token);
      router.push(`/g/${res.gameId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
      setLoading(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Title>Entra in una partita</Title>
        <label className="block">
          <Label>Codice partita</Label>
          <input
            className={`${inputClass} font-mono text-lg uppercase tracking-[0.3em]`}
            value={code}
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
            placeholder="ABC234"
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </label>
        <ProfileFields nickname={nickname} setNickname={setNickname} pref={pref} setPref={setPref} />
        <Button type="submit" variant={initialCode ? "primary" : "secondary"} loading={loading} disabled={!nickname.trim() || code.length < 4}>
          Entra
        </Button>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}

export function ResumeBanner() {
  const router = useRouter();
  const [last, setLast] = useState<{ gameId: string } | null>(null);
  useEffect(() => {
    // localStorage è disponibile solo dopo il montaggio
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLast(getLastGame());
  }, []);
  if (!last) return null;
  return (
    <Card tone="gold" className="flex items-center justify-between gap-3">
      <p className="text-sm">Hai una partita in corso su questo telefono.</p>
      <Button onClick={() => router.push(`/g/${last.gameId}`)}>Riprendi</Button>
    </Card>
  );
}
