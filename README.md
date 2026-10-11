# Cena con Delitto 🕵️

Web app per giocare **cene con delitto dal vivo** con gli amici. Il telefono fa da regista (personaggi, indizi segreti, timer, votazioni); il gioco vero succede a tavola, parlando e mentendo.

- L'**host** crea la partita e gli amici entrano con **codice o QR** dal proprio telefono.
- L'host sceglie ambientazione, tono, durata e difficoltà. Un **LLM genera** storia, personaggi, relazioni, indizi e missioni segrete.
- I personaggi si possono distribuire **giorni prima della cena**, per i costumi. I segreti si sbloccano solo all'inizio della serata.
- La serata è divisa in **atti a tempo**. Durante ogni atto ogni telefono riceve suggerimenti privati: con chi parlare, cosa chiedere, cosa nascondere.
- **Votazioni** a fine atto più un'**accusa finale**:
  - se viene arrestato un innocente, viene scagionato e il suo segreto diventa pubblico;
  - se viene preso il killer, la partita può finire in anticipo;
  - **missioni segrete** confermate dal giocatore "bersaglio", **classifica** finale.
- **Modalità TV** opzionale (`/tv`): narrazione, timer grande ed esiti delle votazioni per tutto il tavolo.

## Stack

| | |
|---|---|
| App | Next.js 16 (App Router) + TypeScript + Tailwind 4 |
| Dati | Supabase: Postgres + Realtime (solo "ping" broadcast) |
| LLM | Google Gemini (free tier) via `@google/genai`; provider `mock` per sviluppo e test |
| Hosting | Vercel (Hobby, gratuito) + Supabase (Free) |

Costo per uso tra amici: **€0**. Supabase Free mette in pausa il progetto dopo 7 giorni senza attività: basta riattivarlo dalla dashboard prima della cena.

## Architettura (in breve)

- **Il server è la fonte di verità.** I client non leggono mai il database. Tutte le tabelle hanno RLS attiva senza policy e la chiave pubblica non vede nulla. Ogni dato passa dalle API (`app/api/**`), che costruiscono una vista per giocatore (`lib/server/view.ts`): segreti, messaggi privati e soluzione arrivano solo a chi può vederli.
- **Identità = token per partita.** Il token è salvato sul telefono e nel DB solo come hash. Ogni giocatore ha anche un **link personale di rientro** (`/r/<token>`). L'host può **riassegnare** un giocatore a un nuovo telefono con un QR. Non serve nessun login.
- **Sessione stabile anche a telefono bloccato.**
  - Il timer è calcolato da timestamp del server, quindi resta corretto dopo il blocco.
  - I messaggi sono salvati nel DB: quelli arrivati mentre il telefono era bloccato compaiono come popup ("Mentre eri via…").
  - Il client (`lib/client/useGameSync.ts`) rilegge lo stato:
    - quando arriva un ping Realtime;
    - con un heartbeat ogni 20 secondi;
    - quando il telefono torna in primo piano o la rete torna disponibile;
    - all'orario dei messaggi programmati.
- **`/tick` idempotente.** Chiunque sia collegato fa avanzare la partita:
  - rilascia i messaggi programmati e chiude i voti scaduti;
  - se l'host sparisce, passa da solo alla fase successiva dopo 3 minuti di tolleranza.
- **Concorrenza ottimistica.** Ogni modifica a `games` incrementa `version` tramite un trigger, e le transizioni usano `where version = <attesa>`: niente doppi avanzamenti.
- **Generazione a step riprendibile** (`lib/server/generation.ts`):
  - tre richieste separate, trama → personaggi → copione, poi il salvataggio;
  - il killer e l'assegnazione dei personaggi li decide il codice, non il modello;
  - dopo ogni step c'è una validazione di coerenza (`lib/game/validate.ts`): killer, indizi chiave consegnati, side quest con bersagli validi, nessun messaggio che "spoileri" il colpevole;
  - se la validazione fallisce, lo step si rigenera rimandando gli errori al modello.

```
app/            pagine (home, /join, /g/[id], /tv, /r/[token]) e API
components/     UI (lobby, briefing, gioco, regia host, TV)
lib/game/       logica pura e testata: fasi, engine, voti, punteggi, schemi, validazione
lib/llm/        provider Gemini + mock, prompt
lib/server/     accesso DB, flusso di gioco, generazione, vista per giocatore
supabase/       config e migrazioni SQL
tests/          unit, integrazione (API reali), e2e (Playwright)
```

## Sviluppo in locale

Requisiti: Node 22, Docker (per Supabase locale).

```bash
npm install
npm run db:start            # Supabase locale (Docker); stampa URL e chiavi
cp .env.example .env.local  # incolla URL, publishable key e secret key
#   per giocare senza LLM: LLM_PROVIDER=mock
npm run dev                 # http://localhost:3000
```

Per provare con più "telefoni" usa più finestre in incognito, oppure il telefono vero sulla stessa rete: `http://<ip-del-pc>:3000`.

### Test

```bash
npm run lint && npm run typecheck
npm test                    # unit (engine, fasi, voti, validatori, storia mock, schema Gemini)
npm run test:integration    # API reali: partita completa, segretezza, auto-avanzamento, riassegnazione
npm run test:e2e            # Playwright: 4 telefoni + TV nel browser, con screenshot
```

Integrazione ed e2e richiedono Supabase locale avviato e `npm run dev` con `LLM_PROVIDER=mock`.

## Pubblicazione (gratis)

### 1. Supabase
1. Crea un progetto su [supabase.com](https://supabase.com), meglio in regione EU (es. Frankfurt).
2. Applica lo schema, in uno dei due modi:
   - **SQL Editor**: incolla ed esegui `supabase/migrations/20261011100000_init.sql`;
   - **CLI**: `npx supabase link --project-ref <ref>` e poi `npx supabase db push`.
3. In *Project Settings → API Keys* copia l'URL del progetto, la **publishable key** e la **secret key**.
4. In *Realtime → Settings* lascia attivo l'accesso ai canali pubblici. I canali trasportano solo ping senza dati di gioco.

Non serve configurare Supabase Auth.

### 2. Gemini
1. Crea una API key su [Google AI Studio](https://aistudio.google.com/apikey).
2. Imposta `GEMINI_MODEL` con il Flash più recente disponibile nel free tier. Il default è `gemini-3.5-flash`; `gemini-2.5-flash` è in dismissione. Controlla l'elenco dei modelli in AI Studio.
3. Sul free tier Google può usare i prompt per migliorare i suoi prodotti, e i limiti di richieste cambiano nel tempo. Al modello non arrivano i nomi dei giocatori, solo numero di personaggi e preferenze, più le note dell'host se le scrive.

### 3. Vercel
1. *Add New → Project* e importa il repo GitHub.
2. Imposta le variabili d'ambiente:

   | Variabile | Valore |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL del progetto Supabase |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `SUPABASE_SECRET_KEY` | secret key (**solo server**; va bene anche `SUPABASE_SERVICE_ROLE_KEY`) |
   | `LLM_PROVIDER` | facoltativo: vuoto = Gemini se c'è la chiave, altrimenti storia di esempio |
   | `GEMINI_API_KEY` | la tua chiave |
   | `GEMINI_MODEL` | es. `gemini-3.5-flash` |
   | `DAILY_GENERATION_CAP` | es. `20` (protegge il free tier) |

3. Lascia attivo *Fluid Compute* (default): la generazione può durare fino a 300 secondi per step.
4. Consigliato: in *Settings → Functions* scegli una regione vicina a Supabase (es. `fra1`).
5. Deploy. Ogni push sul branch principale ripubblica l'app; ogni branch ha la sua preview.

## Come si gioca (per l'host)

1. **Crea la partita** e condividi il QR o il link. Ognuno entra con il suo nome e la preferenza per il personaggio (uomo, donna o indifferente).
2. **Imposta la serata** e premi *Genera la storia* (serve circa un minuto). Puoi farlo anche giorni prima: tutti vedono il proprio personaggio pubblico e il costume consigliato.
3. A tavola premi **Inizia la serata**: ognuno riceve storia, segreto, alibi, obiettivi e missioni. L'assassino lo sa solo il suo telefono, e nemmeno tu che sei l'host conosci la soluzione.
4. Ogni atto ha un timer indicativo e arrivano suggerimenti privati. Allo scadere, dalla tab **Regia** passi alla fase successiva oppure aggiungi 5 minuti. Usa **Pausa** quando arriva la portata.
5. **Votazioni**: vince la maggioranza; in caso di parità nessuno viene arrestato.
6. **Epilogo**: rivelazione completa, classifica, miglior detective e bugiardo della serata.

Opzionale: collega una TV o un tablet su `/tv` con il codice della partita.

## Idee per la fase 2

- Ritratti AI dei personaggi.
- Scenari salvati e rigiocabili.
- Notifiche Web Push (PWA).
- Provider alternativo (es. Claude Haiku) se la qualità delle trame Gemini non basta.
- Pulizia automatica delle partite vecchie.
