import { z } from "zod";
import { hostControl } from "@/lib/server/flow";
import { authPlayer, loadGame, requireHost } from "@/lib/server/game";
import { handler, readJson } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };
const body = z.object({
  action: z.enum(["next", "extend", "pause", "resume", "close_vote", "end"]),
  version: z.number().int(),
});

export const POST = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { action, version } = await readJson(req, body);
  const game = await loadGame(id);
  requireHost(await authPlayer(req, id));
  await hostControl(game, action, version);
});
