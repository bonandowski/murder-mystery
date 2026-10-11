import { JoinGameForm } from "@/components/EntryForms";
import { Screen } from "@/components/ui";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <Screen>
      <header className="pt-6 text-center">
        <h1 className="font-display text-3xl text-gold">Sei stato invitato</h1>
        <p className="mt-2 text-sm text-muted">Scegli il tuo nome: il personaggio te lo assegna la storia.</p>
      </header>
      <JoinGameForm initialCode={code} />
    </Screen>
  );
}
