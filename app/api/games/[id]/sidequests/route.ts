import { z } from "zod";
import { sideQuestAction } from "@/lib/server/flow";
import { authPlayer, loadGame } from "@/lib/server/game";
import { handler, readJson } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({ sideQuestId: z.string().uuid(), action: z.enum(["claim", "confirm", "reject"]) });

export const POST = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { sideQuestId, action } = await readJson(req, body);
  const game = await loadGame(id);
  const me = await authPlayer(req, id);
  await sideQuestAction(game, me, sideQuestId, action);
});
