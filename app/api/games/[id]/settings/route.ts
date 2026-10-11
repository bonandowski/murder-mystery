import { gameSettingsSchema } from "@/lib/game/settings";
import { authPlayer, loadGame, requireHost } from "@/lib/server/game";
import { handler, readJson } from "@/lib/server/http";
import { updateSettings } from "@/lib/server/lobby";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const settings = await readJson(req, gameSettingsSchema);
  const game = await loadGame(id);
  requireHost(await authPlayer(req, id));
  await updateSettings(game, settings);
});
