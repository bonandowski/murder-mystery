import { characterKeys, type Details, type GenerationContext, type Plot, type Script } from "@/lib/game/schemas";

/**
 * Storia fissa ("Delitto a Villa Ravelli") che si adatta a 4–10 giocatori,
 * al killer scelto, ai generi richiesti e al numero di atti/side quest.
 * Serve per sviluppo, test ed E2E senza chiamare un LLM.
 */

interface Archetype {
  m: string;
  f: string;
  role: string;
  publicDescription: string;
  look: string;
  relationToVictim: string;
  secret: string;
  apparentMotive: string;
  killerMotive: string;
  alibi: string;
}

const ARCHETYPES: Archetype[] = [
  {
    m: "Dottor Alberto Neri", f: "Dottoressa Alba Neri", role: "Medico di famiglia",
    publicDescription: "Cura il Conte da vent'anni e conosce i segreti di tutta la casa.",
    look: "Completo scuro, borsa da medico, occhiali tondi",
    relationToVictim: "Suo medico personale",
    secret: "Hai prescritto al Conte un sonnifero molto più forte del dovuto, per farlo dormire e frugare nel suo studio.",
    apparentMotive: "Il Conte minacciava di denunciarti per una diagnosi sbagliata.",
    killerMotive: "Il Conte aveva scoperto che falsificavi certificati medici e stasera voleva denunciarti.",
    alibi: "Dici di essere rimasto/a in biblioteca a leggere.",
  },
  {
    m: "Ettore Bassi", f: "Ermelinda Bassi", role: "Maggiordomo / Governante",
    publicDescription: "Serve a Villa Ravelli da trent'anni, discreto/a e sempre presente.",
    look: "Livrea nera, guanti bianchi, vassoio d'argento",
    relationToVictim: "Al suo servizio da una vita",
    secret: "Da anni sottrai bottiglie pregiate dalla cantina e le rivendi in paese.",
    apparentMotive: "Il Conte stava per licenziarti senza liquidazione.",
    killerMotive: "Il Conte aveva scoperto i tuoi furti e voleva farti arrestare domattina.",
    alibi: "Dici di aver servito il caffè in salone tutta la sera.",
  },
  {
    m: "Filippo Ravelli", f: "Filippa Ravelli", role: "Nipote ed erede",
    publicDescription: "Nipote prediletto/a del Conte, pieno/a di debiti e di fascino.",
    look: "Abito elegante un po' sgualcito, sigaretta spenta in mano",
    relationToVictim: "Nipote e unico erede designato",
    secret: "Hai perso al gioco metà della dote di famiglia e il Conte non lo sa.",
    apparentMotive: "Con il Conte morto erediti tutto.",
    killerMotive: "Il Conte voleva cambiare il testamento stasera stessa e diseredarti.",
    alibi: "Dici di essere stato/a in giardino a fumare.",
  },
  {
    m: "Riccardo Valli", f: "Rita Valli", role: "Socio d'affari",
    publicDescription: "Socio/a del Conte nella fabbrica di seta, ambizioso/a e impaziente.",
    look: "Gessato, orologio da taschino, spilla della fabbrica",
    relationToVictim: "Socio in affari",
    secret: "Stai trattando segretamente la vendita della fabbrica a un concorrente.",
    apparentMotive: "Il Conte bloccava ogni tua decisione in fabbrica.",
    killerMotive: "Il Conte aveva scoperto la tua vendita segreta e stava per estrometterti.",
    alibi: "Dici di essere stato/a al telefono con Milano nello studio piccolo.",
  },
  {
    m: "Massimo Lodi", f: "Margherita Lodi", role: "Cantante lirico/a",
    publicDescription: "Stella della lirica invitata a cantare per la festa di fidanzamento.",
    look: "Abito da sera scintillante, sciarpa di seta, tanto profumo",
    relationToVictim: "Ospite d'onore e vecchia fiamma",
    secret: "Hai avuto una relazione con il Conte e hai una figlia segreta con lui.",
    apparentMotive: "Il Conte ti aveva lasciato/a pubblicamente anni fa.",
    killerMotive: "Il Conte rifiutava di riconoscere vostra figlia e stasera ti ha umiliato/a.",
    alibi: "Dici di esserti scaldato/a la voce nella sala della musica.",
  },
  {
    m: "Giorgio Sforzini", f: "Giorgia Sforzini", role: "Fidanzato/a della figlia del Conte",
    publicDescription: "Il/la promesso/a sposo/a della festa, di famiglia nobile ma decaduta.",
    look: "Abito da cerimonia, fiore all'occhiello, anello di fidanzamento",
    relationToVictim: "Futuro genero/nuora",
    secret: "Il tuo titolo nobiliare è falso: l'hai comprato a Napoli.",
    apparentMotive: "Il Conte si opponeva al matrimonio.",
    killerMotive: "Il Conte aveva scoperto che il tuo titolo è falso e stava per annullare le nozze.",
    alibi: "Dici di aver ballato con la tua fidanzata tutta la sera.",
  },
  {
    m: "Avvocato Leone Galli", f: "Avvocata Leonora Galli", role: "Avvocato di famiglia",
    publicDescription: "Custode del testamento del Conte, freddo/a e preciso/a.",
    look: "Completo grigio, cartella di pelle, penna stilografica",
    relationToVictim: "Suo legale di fiducia",
    secret: "Hai sottratto denaro dal fondo fiduciario della famiglia.",
    apparentMotive: "Il Conte voleva cambiare avvocato.",
    killerMotive: "Il Conte stava per scoprire l'ammanco nel fondo fiduciario.",
    alibi: "Dici di aver riletto il testamento nello studio dell'archivio.",
  },
  {
    m: "Tommaso Fiore", f: "Tamara Fiore", role: "Pittore/Pittrice",
    publicDescription: "Artista bohémien ospite della villa per dipingere il ritratto del Conte.",
    look: "Camicia macchiata di colore, foulard, pennello nel taschino",
    relationToVictim: "Ritrattista ospite della villa",
    secret: "Il quadro 'antico' venduto al Conte l'hai dipinto tu: è un falso.",
    apparentMotive: "Il Conte rifiutava di pagarti il ritratto.",
    killerMotive: "Il Conte aveva capito che il suo quadro più prezioso era un tuo falso.",
    alibi: "Dici di aver lavorato al ritratto nell'atelier in soffitta.",
  },
  {
    m: "Nello Ruggeri", f: "Nella Ruggeri", role: "Giardiniere/a",
    publicDescription: "Cura la serra e il parco della villa, conosce ogni pianta velenosa.",
    look: "Gilet di lana, stivali, guanti da giardinaggio",
    relationToVictim: "Suo giardiniere",
    secret: "Coltivi piante proibite nella serra e le vendi di nascosto.",
    apparentMotive: "Il Conte voleva radere al suolo la serra per farci un garage.",
    killerMotive: "Il Conte aveva scoperto le tue coltivazioni illegali e voleva denunciarti.",
    alibi: "Dici di aver chiuso la serra alle 22 e di essere andato/a a dormire.",
  },
  {
    m: "Piero Castelli", f: "Pia Castelli", role: "Giornalista",
    publicDescription: "Cronista mondano/a invitato/a a raccontare la festa sul giornale.",
    look: "Cappello, taccuino, macchina fotografica a tracolla",
    relationToVictim: "Giornalista che aveva scritto contro di lui",
    secret: "Ricatti il Conte da mesi con foto compromettenti.",
    apparentMotive: "Il Conte ti aveva fatto licenziare dal tuo vecchio giornale.",
    killerMotive: "Il Conte aveva scoperto il ricatto e ti aveva teso una trappola con la polizia.",
    alibi: "Dici di aver sviluppato foto nella camera oscura.",
  },
];

const ACT_TITLES = ["Il brindisi interrotto", "Veleni e segreti", "Le carte in tavola", "L'ultima confessione"];
const ACT_TWISTS = [
  "Il Conte crolla dopo il brindisi: nel suo bicchiere c'è del veleno.",
  "Si scopre che il Conte stava per cambiare il testamento proprio stasera.",
  "Dalla cassaforte manca una lettera: qualcuno ha qualcosa da nascondere.",
  "Un testimone ritrova la memoria: l'ora del delitto non è quella che tutti credono.",
];

function pick(ctx: GenerationContext) {
  const keys = characterKeys(ctx.playerCount);
  return keys.map((key, i) => {
    const a = ARCHETYPES[i % ARCHETYPES.length];
    const g = ctx.genders[i] === "x" ? (i % 2 === 0 ? "m" : "f") : ctx.genders[i];
    return { key, a, gender: g as "m" | "f", name: g === "f" ? a.f : a.m };
  });
}

function others(keys: string[], exclude: string[]): string[] {
  return keys.filter((k) => !exclude.includes(k));
}

export function mockPlot(ctx: GenerationContext): Plot {
  const cast = pick(ctx);
  const keys = cast.map((c) => c.key);
  const killer = cast.find((c) => c.key === ctx.killerKey) ?? cast[0];
  const innocents = others(keys, [killer.key]);
  const holder = (i: number) => innocents[i % innocents.length];
  const actOf = (i: number, total: number) => Math.min(ctx.acts, 1 + Math.floor((i * ctx.acts) / total));
  const clueTexts = [
    "Il brandy del Conte conteneva arsenico, lo stesso veleno per topi conservato nella serra.",
    `Alle 22:40 hai visto qualcuno uscire dalla serra: aveva la stessa sciarpa che indossava {{${killer.key}}} a cena.`,
    `Nel registro delle chiavi, la chiave della serra risulta presa da {{${killer.key}}} alle 22:30.`,
    `Hai trovato una lettera mai spedita del Conte: "Domani tutti sapranno la verità su {{${killer.key}}}".`,
    `L'alibi di {{${killer.key}}} non regge: nessuno l'ha visto nel posto in cui dice di essere stato.`,
  ];
  const clueCount = ctx.difficulty === "easy" ? 3 : 4;
  const keyClues = clueTexts.slice(0, clueCount).map((text, i) => ({
    id: `K${i + 1}`,
    text,
    holderKey: holder(i),
    act: actOf(i, clueCount),
  }));
  const redHerrings = Array.from({ length: ctx.redHerrings }, (_, i) => {
    const suspect = innocents[(i + 1) % innocents.length];
    const h = others(keys, [suspect])[(i + 2) % (keys.length - 1)];
    return {
      id: `R${i + 1}`,
      text: `Hai sentito {{${suspect}}} litigare furiosamente con il Conte poco prima del brindisi.`,
      suspectKey: suspect,
      holderKey: h,
      act: 1 + (i % ctx.acts),
    };
  });
  return {
    title: "Delitto a Villa Ravelli",
    setting: ctx.settingDescription,
    premise: "Il Conte Edoardo Ravelli ha riunito parenti, amici e nemici per la festa di fidanzamento della figlia Lucia.",
    dressCode: "Anni '20: abiti da sera, piume, gilet e cappelli.",
    victim: {
      name: "Conte Edoardo Ravelli",
      description: "Industriale della seta, ricchissimo e spietato: tutti gli dovevano qualcosa, nessuno lo amava davvero.",
    },
    crime: {
      method: "Arsenico versato nel bicchiere di brandy del brindisi",
      place: "Il salone principale, durante il brindisi",
      time: "Le 23:00",
      motive: killer.a.killerMotive,
    },
    killerKey: killer.key,
    characters: cast.map((c) => ({
      key: c.key,
      name: c.name,
      gender: c.gender,
      role: c.a.role,
      publicDescription: c.a.publicDescription,
      look: c.a.look,
      relationToVictim: c.a.relationToVictim,
      secret: c.key === killer.key ? `${c.a.secret} E soprattutto: hai avvelenato il Conte.` : c.a.secret,
      alibi: c.a.alibi,
      alibiIsTrue: c.key !== killer.key,
      apparentMotive: c.a.apparentMotive,
    })),
    relationships: keys.map((k, i) => ({
      a: k,
      b: keys[(i + 1) % keys.length],
      description: `{{${k}}} e {{${keys[(i + 1) % keys.length]}}} si conoscono da anni e non si fidano l'uno dell'altro.`,
    })),
    keyClues,
    redHerrings,
    acts: Array.from({ length: ctx.acts }, (_, i) => ({ number: i + 1, title: ACT_TITLES[i], twist: ACT_TWISTS[i] })),
    timeline: [
      { time: "21:00", event: "Arrivo degli ospiti e aperitivo in giardino" },
      { time: "22:30", event: `{{${killer.key}}} prende la chiave della serra` },
      { time: "22:40", event: "Il veleno viene prelevato dalla serra" },
      { time: "23:00", event: "Brindisi: il Conte beve e crolla" },
    ],
    solution: `{{${killer.key}}} ha preso la chiave della serra alle 22:30, ha prelevato l'arsenico e l'ha versato nel brandy del Conte prima del brindisi. Movente: ${killer.a.killerMotive}`,
  };
}

const SIDE_QUESTS = [
  { d: "Fai ammettere a {{T}} che conosceva il Conte molto meglio di quanto dice.", p: "{{O}} ti ha fatto ammettere che conoscevi il Conte meglio di quanto dici?" },
  { d: "Convinci {{T}} a fare un brindisi in memoria del Conte davanti a tutti.", p: "{{O}} ti ha convinto a brindare in memoria del Conte?" },
  { d: "Fatti raccontare da {{T}} il suo alibi nei minimi dettagli, ora per ora.", p: "Hai raccontato a {{O}} il tuo alibi ora per ora?" },
  { d: "Scopri da {{T}} il nome della persona che odia di più in questa stanza.", p: "Hai rivelato a {{O}} chi odi di più in questa stanza?" },
];

export function mockDetails(ctx: GenerationContext, plot: Plot): Details {
  const keys = plot.characters.map((c) => c.key);
  return {
    characters: plot.characters.map((c, i) => {
      const next = keys[(i + 1) % keys.length];
      const isKiller = c.key === plot.killerKey;
      return {
        key: c.key,
        backstory: `Sei ${c.name}, ${c.role.toLowerCase()}. ${c.publicDescription} ${c.secret}`,
        objectives: [
          "Scopri chi ha preso la chiave della serra prima del brindisi.",
          `Non far scoprire a nessuno il tuo segreto, soprattutto a {{${next}}}.`,
          `Chiedi a {{${keys[(i + 2) % keys.length]}}} dove si trovava alle 22:40.`,
        ],
        knowledge: [{ aboutKey: next, fact: `Hai visto {{${next}}} molto nervoso/a prima del brindisi.` }],
        killerGuidance: isKiller
          ? `Sei tu l'assassino. Sostieni il tuo alibi falso ("${c.alibi}"), fai notare a tutti i litigi tra il Conte e gli altri ospiti e cerca di spostare i sospetti su {{${next}}}.`
          : "",
        exonerationReveal: isKiller ? "" : `{{${c.key}}} è innocente, ma nascondeva questo: ${c.secret}`,
        sideQuests: Array.from({ length: ctx.sideQuestsPer }, (_, q) => {
          const target = keys[(i + 1 + q) % keys.length];
          const t = SIDE_QUESTS[(i + q) % SIDE_QUESTS.length];
          return {
            targetKey: target,
            description: t.d.replace("{{T}}", `{{${target}}}`),
            targetPrompt: t.p.replace("{{O}}", `{{${c.key}}}`),
          };
        }),
      };
    }),
  };
}

export function mockScript(ctx: GenerationContext, plot: Plot): Script {
  const keys = plot.characters.map((c) => c.key);
  return {
    prologueNarration:
      "Villa Ravelli, una sera d'estate del 1925. Gli ospiti brindano al fidanzamento di Lucia… finché il Conte Edoardo non crolla a terra, il bicchiere ancora in mano. Nessuno lascerà la villa finché il colpevole non sarà smascherato. Leggete la vostra scheda: ognuno di voi ha qualcosa da nascondere.",
    acts: plot.acts.map((act) => {
      const messages: Script["acts"][number]["messages"] = [];
      keys.forEach((k, i) => {
        const target = keys[(i + act.number) % keys.length] === k ? keys[(i + 1) % keys.length] : keys[(i + act.number) % keys.length];
        messages.push({
          toKey: k,
          moment: "start",
          kind: "hint",
          clueId: "",
          title: "Una domanda scomoda",
          body: `Vai da {{${target}}} e chiedi cosa faceva poco prima del brindisi. Osserva bene come reagisce.`,
        });
      });
      for (const clue of plot.keyClues.filter((c) => c.act === act.number)) {
        messages.push({ toKey: clue.holderKey, moment: "middle", kind: "clue", clueId: clue.id, title: "Hai scoperto qualcosa", body: clue.text });
      }
      for (const rh of plot.redHerrings.filter((r) => r.act === act.number)) {
        messages.push({ toKey: rh.holderKey, moment: "late", kind: "clue", clueId: "", title: "Un ricordo improvviso", body: rh.text });
      }
      messages.push({
        toKey: plot.killerKey,
        moment: "middle",
        kind: "killer_tip",
        clueId: "",
        title: "Copri le tue tracce",
        body: "Qualcuno sta facendo domande sulla serra. Cambia discorso e ricorda a tutti chi ha litigato con il Conte stasera.",
      });
      messages.push({
        toKey: "ALL",
        moment: "late",
        kind: "event",
        clueId: "",
        title: "Un rumore nella notte",
        body: "Una finestra sbatte al piano di sopra. Qualcuno è sparito per qualche minuto: chi?",
      });
      return { number: act.number, narration: act.twist, messages };
    }),
    showdownNarration: "Il colpevole è in manette, ma la notte non è finita: restano conti in sospeso tra gli ospiti.",
    epilogueNarration: `La verità: ${plot.solution}`,
  };
}
