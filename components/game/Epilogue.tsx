"use client";

import type { PlayerView } from "@/lib/game/view";
import { characterLabel, RichText } from "../RichText";
import { Card, Title } from "../ui";

export function Epilogue({ view, big = false }: { view: PlayerView; big?: boolean }) {
  const sol = view.solution;
  const scores = view.scores ?? [];
  const killer = view.characters.find((c) => c.id === sol?.killerCharacterId);
  const caught = killer?.arrestStatus === "killer";
  const detective = scores.find((s) => s.characterId !== sol?.killerCharacterId && s.points > 0);
  const killerScore = scores.find((s) => s.characterId === sol?.killerCharacterId);
  const narration = [...view.messages].reverse().find((m) => m.kind === "narration" && m.title === "La verità");
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <>
      <Card tone="crimson" className="animate-pop">
        <p className="text-xs uppercase tracking-[0.3em] text-muted">La verità</p>
        <h2 className={`font-display ${big ? "text-6xl" : "text-3xl"} mt-1 text-gold`}>
          {killer ? characterLabel(view, killer.id) : "—"}
        </h2>
        <p className={`${big ? "text-2xl" : "text-base"} mt-1 ${caught ? "text-green-300" : "text-red-300"}`}>
          {caught ? "è stato smascherato!" : "l'ha fatta franca!"}
        </p>
        {narration ? (
          <p className={`mt-4 ${big ? "text-xl" : "text-sm"} leading-relaxed`}>
            <RichText text={narration.body} view={view} />
          </p>
        ) : null}
        {sol ? (
          <dl className={`mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 ${big ? "text-lg" : "text-sm"}`}>
            <dt className="text-muted">Movente</dt>
            <dd><RichText text={sol.motive} view={view} /></dd>
            <dt className="text-muted">Come</dt>
            <dd><RichText text={sol.method} view={view} /></dd>
          </dl>
        ) : null}
      </Card>
      <Card tone="gold">
        <Title className="mb-3">Classifica</Title>
        <ol className="flex flex-col gap-2">
          {scores.map((s, i) => (
            <li key={s.playerId} className="rounded-xl bg-surface-2 p-3" data-testid="score-row">
              <div className={`flex items-center justify-between ${big ? "text-2xl" : ""}`}>
                <span>
                  {medal[i] ?? `${i + 1}.`} {s.nickname}
                  {s.characterId ? <span className="text-muted"> · {view.characters.find((c) => c.id === s.characterId)?.name}</span> : null}
                </span>
                <span className="font-mono text-gold">{s.points}</span>
              </div>
              {!big && s.reasons.length ? (
                <ul className="mt-1 text-xs text-muted">
                  {s.reasons.map((r, j) => (
                    <li key={j}>
                      +{r.points} {r.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ol>
        <div className={`mt-4 flex flex-col gap-1 ${big ? "text-xl" : "text-sm"}`}>
          {detective ? <p>🔎 Miglior detective: <span className="text-gold">{detective.nickname}</span></p> : null}
          {killerScore ? (
            <p>
              🎭 {caught ? "Assassino smascherato" : "Bugiardo della serata"}: <span className="text-gold">{killerScore.nickname}</span>
            </p>
          ) : null}
        </div>
      </Card>
      {sol?.timeline.length ? (
        <Card>
          <Title className="mb-2">Cosa è successo davvero</Title>
          <ol className={`flex flex-col gap-1 ${big ? "text-lg" : "text-sm"}`}>
            {sol.timeline.map((t, i) => (
              <li key={i}>
                <span className="font-mono text-gold">{t.time}</span> — <RichText text={t.event} view={view} />
              </li>
            ))}
          </ol>
        </Card>
      ) : null}
    </>
  );
}
