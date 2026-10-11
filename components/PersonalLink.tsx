"use client";

import { useEffect, useState } from "react";
import { getToken, personalLink } from "@/lib/client/session";
import { Button, Card } from "./ui";

/** Link di rientro: salva la sessione anche se il browser cancella i dati o si cambia telefono. */
export function PersonalLink({ gameId }: { gameId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const t = getToken(gameId);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLink(t ? personalLink(t) : null);
  }, [gameId]);
  if (!link) return null;
  async function copy() {
    try {
      await navigator.clipboard.writeText(link!);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia il tuo link personale", link!);
    }
  }
  return (
    <Card>
      <details>
        <summary className="cursor-pointer text-sm text-muted">Il tuo link personale per rientrare</summary>
        <p className="mt-2 text-sm text-muted">
          Salvalo (es. in una chat con te stesso): se chiudi il browser, cambi telefono o il telefono cancella i dati, con
          questo link rientri nella partita come te. Non condividerlo.
        </p>
        <Button variant="secondary" className="mt-3 w-full" onClick={copy}>
          {copied ? "Copiato!" : "Copia link personale"}
        </Button>
      </details>
    </Card>
  );
}
