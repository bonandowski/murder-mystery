import Link from "next/link";
import { CreateGameForm, JoinGameForm, ResumeBanner } from "@/components/EntryForms";
import { Screen } from "@/components/ui";

export default function Home() {
  return (
    <Screen>
      <header className="pt-6 text-center">
        <p className="text-xs uppercase tracking-[0.4em] text-muted">Stasera qualcuno mente</p>
        <h1 className="font-display mt-2 text-4xl text-gold">Cena con Delitto</h1>
        <p className="mt-3 text-sm text-muted">
          Il telefono fa da regista: personaggi, indizi segreti e votazioni. Il resto succede a tavola.
        </p>
      </header>
      <ResumeBanner />
      <JoinGameForm />
      <CreateGameForm />
      <p className="text-center text-sm text-muted">
        Hai una TV o un tablet? <Link href="/tv" className="text-gold underline">Collega lo schermo condiviso</Link>
      </p>
    </Screen>
  );
}
