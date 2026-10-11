import { startEvening } from "@/lib/server/flow";
import { authPlayer, loadGame, requireHost } from "@/lib/server/game";
import { handler } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const game = await loadGame(id);
  requireHost(await authPlayer(req, id));
  await startEvening(game);
});
