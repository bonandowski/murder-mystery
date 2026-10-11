import { z } from "zod";
import { authPlayer, loadGame, requireHost } from "@/lib/server/game";
import { handler, readJson } from "@/lib/server/http";
import { kickPlayer, reassignPlayer, updateMe } from "@/lib/server/lobby";

type Ctx = { params: Promise<{ id: string }> };
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("kick"), playerId: z.string().uuid() }),
  z.object({ action: z.literal("reassign"), playerId: z.string().uuid() }),
  z.object({ action: z.literal("me"), nickname: z.string().max(40).optional(), pref: z.enum(["m", "f", "any"]).optional() }),
]);

export const POST = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = await readJson(req, body);
  const game = await loadGame(id);
  const me = await authPlayer(req, id);
  if (input.action === "me") return updateMe(game, me, input);
  requireHost(me);
  if (input.action === "kick") return kickPlayer(game, me, input.playerId);
  return reassignPlayer(game, input.playerId);
});
