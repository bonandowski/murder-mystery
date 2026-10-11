import { z } from "zod";
import { castVote } from "@/lib/server/flow";
import { authPlayer, loadGame } from "@/lib/server/game";
import { handler, readJson } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ characterId: z.string().uuid() });

export const POST = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { characterId } = await readJson(req, body);
  const game = await loadGame(id);
  const me = await authPlayer(req, id);
  await castVote(game, me, characterId);
});
