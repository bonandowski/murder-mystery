"use client";

import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, gameApi } from "@/lib/client/api";
import {
  DIFFICULTIES,
  DURATIONS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  SETTING_PRESETS,
  TONES,
  type GameSettings,
} from "@/lib/game/settings";
import type { PlayerView } from "@/lib/game/view";
import { PersonalLink } from "./PersonalLink";
import { Badge, Button, Card, ErrorText, inputClass, Label, Segmented, Title } from "./ui";

const STEPS = ["Trama", "Personaggi", "Copione", "Salvataggio"];

export function Lobby({ view, refresh }: { view: PlayerView; refresh: () => void }) {
  const players = view.players.filter((p) => !p.isSpectator);
  const generating = view.game.status === "generating";
  return (
    <>
      <InviteCard code={view.game.code} />
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <Title>Invitati</Title>
          <Badge tone={players.length >= MIN_PLAYERS ? "green" : "neutral"}>
            {players.length}/{MAX_PLAYERS}
          </Badge>
        </div>
        <ul className="flex flex-col gap-2">
          {players.map((p) => (
            <PlayerRow key={p.id} view={view} player={p} canKick={view.me.isHost && !p.isHost && !generating} onChange={refresh} />
          ))}
        </ul>
        {players.length < MIN_PLAYERS ? (
          <p className="mt-3 text-sm text-muted">Servono almeno {MIN_PLAYERS} giocatori per iniziare.</p>
        ) : null}
      </Card>
      {view.me.isHost ? <HostSetup view={view} /> : <SettingsSummary settings={view.game.settings} />}
      {generating ? <GenerationProgress view={view} /> : null}
      <PersonalLink gameId={view.game.id} />
    </>
  );
}

function InviteCard({ code }: { code: string }) {
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setOrigin(window.location.origin), []);
  const url = origin ? `${origin}/join/${code}` : "";
  async function share() {
    try {
      if (navigator.share) await navigator.share({ title: "Cena con Delitto", text: `Entra nella partita: codice ${code}`, url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* condivisione annullata */
    }
  }
  return (
    <Card tone="gold" className="flex items-center gap-4">
      <div className="rounded-xl bg-white p-2">{url ? <QRCodeSVG value={url} size={112} /> : <div className="size-28" />}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Label>Codice partita</Label>
        <p className="font-mono text-3xl tracking-[0.25em] text-gold" data-testid="game-code">
          {code}
        </p>
        <Button variant="secondary" onClick={share} className="w-full">
          Condividi invito
        </Button>
      </div>
    </Card>
  );
}

function PlayerRow({
  view,
  player,
  canKick,
  onChange,
}: {
  view: PlayerView;
  player: PlayerView["players"][number];
  canKick: boolean;
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function kick() {
    if (!confirm(`Rimuovere ${player.nickname}?`)) return;
    setBusy(true);
    try {
      await gameApi(view.game.id).post("players", { action: "kick", playerId: player.id });
      onChange();
    } finally {
      setBusy(false);
    }
  }
  const pref = player.characterPref === "f" ? "donna" : player.characterPref === "m" ? "uomo" : "indifferente";
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2">
      <span className={`size-2.5 rounded-full ${player.online ? "bg-green" : "bg-line"}`} title={player.online ? "online" : "offline"} />
      <span className="flex-1 truncate">
        {player.nickname}
        {player.id === view.me.id ? <span className="text-muted"> (tu)</span> : null}
      </span>
      <span className="text-xs text-muted">{pref}</span>
      {player.isHost ? <Badge tone="gold">host</Badge> : null}
      {canKick ? (
        <button onClick={kick} disabled={busy} className="px-2 text-muted hover:text-red-300" aria-label={`Rimuovi ${player.nickname}`}>
          ✕
        </button>
      ) : null}
    </li>
  );
}

function SettingsSummary({ settings }: { settings: GameSettings }) {
  return (
    <Card>
      <Title className="mb-2">La serata</Title>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">Ambientazione</dt>
        <dd>{settings.settingPreset === "custom" ? settings.customSetting || "Personalizzata" : SETTING_PRESETS[settings.settingPreset]}</dd>
        <dt className="text-muted">Tono</dt>
        <dd>{TONES[settings.tone]}</dd>
        <dt className="text-muted">Durata</dt>
        <dd>{settings.durationMin} minuti</dd>
        <dt className="text-muted">Difficoltà</dt>
        <dd>{DIFFICULTIES[settings.difficulty]}</dd>
      </dl>
      <p className="mt-3 text-sm text-muted">L&apos;host sta preparando la storia. Tieni il telefono a portata di mano.</p>
    </Card>
  );
}

function HostSetup({ view }: { view: PlayerView }) {
  const [settings, setSettings] = useState<GameSettings>(view.game.settings);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const locked = view.game.status !== "lobby";
  const players = view.players.filter((p) => !p.isSpectator).length;

  function update(patch: Partial<GameSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      gameApi(view.game.id)
        .post("settings", next)
        .catch((err: Error) => setError(err.message));
    }, 400);
  }

  async function generate() {
    setError(null);
    setStarting(true);
    window.clearTimeout(saveTimer.current);
    try {
      await gameApi(view.game.id).post("settings", settings);
      await runGeneration(view.game.id, 1, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore");
    } finally {
      setStarting(false);
    }
  }

  return (
    <Card>
      <Title className="mb-3">Imposta la serata</Title>
      <fieldset disabled={locked} className="flex flex-col gap-4">
        <label className="block">
          <Label>Ambientazione</Label>
          <select
            className={inputClass}
            value={settings.settingPreset}
            onChange={(e) => update({ settingPreset: e.target.value as GameSettings["settingPreset"] })}
          >
            {Object.entries(SETTING_PRESETS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
            <option value="custom">Personalizzata…</option>
          </select>
        </label>
        {settings.settingPreset === "custom" ? (
          <textarea
            className={inputClass}
            rows={3}
            maxLength={400}
            placeholder="Es. Un rifugio in montagna bloccato dalla neve, anni '70"
            value={settings.customSetting}
            onChange={(e) => update({ customSetting: e.target.value })}
          />
        ) : null}
        <div>
          <Label>Tono</Label>
          <select className={inputClass} value={settings.tone} onChange={(e) => update({ tone: e.target.value as GameSettings["tone"] })}>
            {Object.entries(TONES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Durata indicativa</Label>
          <Segmented
            value={String(settings.durationMin)}
            options={DURATIONS.map((d) => ({ value: String(d), label: d < 120 ? `${d}′` : `${Math.floor(d / 60)}h${d % 60 ? "½" : ""}` }))}
            onChange={(v) => update({ durationMin: Number(v) })}
          />
        </div>
        <div>
          <Label>Difficoltà</Label>
          <Segmented
            value={settings.difficulty}
            options={Object.entries(DIFFICULTIES).map(([value, label]) => ({ value: value as GameSettings["difficulty"], label }))}
            onChange={(v) => update({ difficulty: v })}
          />
          <p className="mt-1 text-xs text-muted">
            {settings.difficulty === "easy"
              ? "Indizi diretti, niente missioni segrete."
              : settings.difficulty === "medium"
                ? "Una missione segreta a testa, qualche depistaggio."
                : "Due missioni a testa, indizi da combinare, killer agguerrito."}
          </p>
        </div>
        <label className="block">
          <Label>Note per la storia (facoltative)</Label>
          <input
            className={inputClass}
            maxLength={400}
            placeholder="Es. è il compleanno di Marco, niente temi troppo cupi"
            value={settings.notes}
            onChange={(e) => update({ notes: e.target.value })}
          />
        </label>
      </fieldset>
      {view.demoStory ? (
        <p className="mt-4 rounded-xl border border-gold/40 bg-gold/10 p-3 text-sm">
          Modalità demo: sul server non c&apos;è ancora una chiave Gemini, quindi verrà usata la storia di esempio
          “Delitto a Villa Ravelli”. Aggiungi <code>GEMINI_API_KEY</code> su Vercel per storie sempre nuove.
        </p>
      ) : null}
      {!locked ? (
        <Button className="mt-4 w-full" onClick={generate} loading={starting} disabled={players < MIN_PLAYERS || players > MAX_PLAYERS}>
          Genera la storia ({players} personaggi)
        </Button>
      ) : null}
      <p className="mt-2 text-xs text-muted">Generando la storia la lista degli invitati si blocca. Puoi farlo anche giorni prima della cena.</p>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

interface StepResponse {
  ok: boolean;
  step: number;
  done?: boolean;
  errors?: string[];
  retryable?: boolean;
}

const driving = new Map<string, Promise<void>>();

/** Una sola pipeline per partita in questa scheda: chiamate ripetute si agganciano a quella in corso. */
export function runGeneration(gameId: string, fromStep: number, restart: boolean): Promise<void> {
  const current = driving.get(gameId);
  if (current) return current;
  const p = driveGeneration(gameId, fromStep, restart).finally(() => driving.delete(gameId));
  driving.set(gameId, p);
  return p;
}

/** Il telefono dell'host guida la pipeline a step; ogni step è una richiesta separata e riprendibile. */
async function driveGeneration(gameId: string, fromStep: number, restart: boolean): Promise<void> {
  const api = gameApi(gameId);
  let step = fromStep;
  let attempts = 0;
  let first = restart;
  while (step <= 4) {
    const res = await api.post<StepResponse>("generate", { step, restart: first });
    first = false;
    if (res.ok) {
      if (res.done) return;
      step += 1;
      attempts = 0;
      continue;
    }
    attempts += 1;
    if (!res.retryable || attempts >= 3) {
      throw new Error(res.errors?.[0] ?? "La generazione non è riuscita.");
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

function GenerationProgress({ view }: { view: PlayerView }) {
  const { step, error } = view.game.generation;
  const [running, setRunning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const started = useRef(false);

  const resume = useCallback(async () => {
    setRunning(true);
    setLocalError(null);
    try {
      await runGeneration(view.game.id, Math.min(4, step + 1), false);
    } catch (err) {
      setLocalError(err instanceof ApiError || err instanceof Error ? err.message : "Errore");
    } finally {
      setRunning(false);
    }
  }, [view.game.id, step]);

  // Se l'host ricarica la pagina a metà generazione, si riparte da dove si era rimasti.
  useEffect(() => {
    if (!view.me.isHost || started.current) return;
    started.current = true;
    const t = window.setTimeout(() => {
      if (!error) void resume();
    }, 1500);
    return () => window.clearTimeout(t);
  }, [view.me.isHost, resume, error]);

  async function cancel() {
    if (!confirm("Annullare la generazione e tornare alla lobby?")) return;
    await gameApi(view.game.id).post("generate", { cancel: true });
  }

  return (
    <Card tone="gold">
      <Title className="mb-3">Sto scrivendo il mistero…</Title>
      <ol className="flex flex-col gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = step >= n;
          const active = step + 1 === n;
          return (
            <li key={label} className="flex items-center gap-3 text-sm">
              <span
                className={`flex size-6 items-center justify-center rounded-full text-xs ${done ? "bg-gold text-gold-ink" : active ? "animate-pulse-soft border border-gold text-gold" : "border border-line text-muted"}`}
              >
                {done ? "✓" : n}
              </span>
              <span className={done ? "text-ink" : "text-muted"}>{label}</span>
            </li>
          );
        })}
      </ol>
      {view.me.isHost ? (
        <div className="mt-4 flex flex-col gap-2">
          <ErrorText>{localError ?? (running ? null : error)}</ErrorText>
          {!running && (localError || error) ? <Button onClick={resume}>Riprova</Button> : null}
          <Button variant="ghost" onClick={cancel} disabled={running}>
            Annulla e torna alla lobby
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">Ci vuole circa un minuto.</p>
      )}
    </Card>
  );
}
