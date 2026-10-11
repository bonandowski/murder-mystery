"use client";

import type { PlayerView } from "@/lib/game/view";
import { CastList } from "../Briefing";
import { RichText } from "../RichText";
import { Card, Label } from "../ui";

export function CharacterSheet({ view }: { view: PlayerView }) {
  const me = view.characters.find((c) => c.id === view.me.characterId);
  const secret = view.mySecret;
  if (!me) return <CastList view={view} />;
  return (
    <>
      <Card tone={secret?.isKiller ? "crimson" : "gold"}>
        {secret?.isKiller ? (
          <p className="mb-2 rounded-lg bg-crimson/20 px-3 py-2 text-sm font-semibold text-red-200" data-testid="killer-banner">
            🗡️ Sei tu l&apos;assassino. Nessuno deve scoprirlo.
          </p>
        ) : null}
        <h2 className="font-display text-2xl">{me.name}</h2>
        <p className="text-sm text-gold">{me.role}</p>
        <p className="mt-2 text-sm text-muted"><RichText text={me.publicDescription} view={view} /></p>
      </Card>
      {secret ? (
        <Card>
          <Section title="La tua storia">
            <RichText text={secret.backstory} view={view} />
          </Section>
          <Section title="Rapporto con la vittima">
            <RichText text={secret.relationToVictim} view={view} />
          </Section>
          <Section title="Il tuo segreto">
            <RichText text={secret.secret} view={view} />
          </Section>
          <Section title="Il tuo alibi">
            <RichText text={secret.alibi} view={view} />
          </Section>
          <Section title="Perché potrebbero sospettare di te">
            <RichText text={secret.apparentMotive} view={view} />
          </Section>
          {secret.killerGuidance ? (
            <Section title="Come cavartela">
              <RichText text={secret.killerGuidance} view={view} />
            </Section>
          ) : null}
          <Section title="Obiettivi">
            <ul className="list-disc pl-5">
              {secret.objectives.map((o, i) => (
                <li key={i}>
                  <RichText text={o} view={view} />
                </li>
              ))}
            </ul>
          </Section>
          {secret.knowledge.length ? (
            <Section title="Cosa sai degli altri">
              <ul className="list-disc pl-5">
                {secret.knowledge.map((k, i) => (
                  <li key={i}>
                    <RichText text={k.fact.includes(`{{${k.aboutKey}}}`) ? k.fact : `{{${k.aboutKey}}}: ${k.fact}`} view={view} />
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </Card>
      ) : null}
      <CastList view={view} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 last:mb-0">
      <Label>{title}</Label>
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  );
}
