import { authPlayer, loadGame } from "@/lib/server/game";
import { handler } from "@/lib/server/http";
import { buildView } from "@/lib/server/view";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const game = await loadGame(id);
  const me = await authPlayer(req, id);
  return buildView(game, me);
});
