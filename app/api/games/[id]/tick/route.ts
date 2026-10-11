import { z } from "zod";
import { tick } from "@/lib/server/flow";
import { authPlayer, loadGame } from "@/lib/server/game";
import { handler, readJson } from "@/lib/server/http";
import { buildView } from "@/lib/server/view";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({
  readUpTo: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s))).nullish(),
});

/** Heartbeat + manutenzione idempotente (rilascio messaggi, chiusura voti, auto-avanzamento). */
export const POST = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { readUpTo } = await readJson(req, body);
  const game = await loadGame(id);
  const me = await authPlayer(req, id);
  const result = await tick(game, me, readUpTo);
  return buildView(result.game, result.player);
});
