import { z } from "zod";
import { authPlayer, loadGame, requireHost } from "@/lib/server/game";
import { cancelGeneration, runGenerationStep } from "@/lib/server/generation";
import { handler, readJson } from "@/lib/server/http";

// Ogni step chiama l'LLM: lasciamo margine (Vercel con Fluid Compute arriva a 300s anche su Hobby).
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };
const body = z.union([
  z.object({ step: z.number().int().min(1).max(4), restart: z.boolean().default(false) }),
  z.object({ cancel: z.literal(true) }),
]);

export const POST = handler<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = await readJson(req, body);
  const game = await loadGame(id);
  requireHost(await authPlayer(req, id));
  if ("cancel" in input) {
    await cancelGeneration(game);
    return { ok: true };
  }
  return runGenerationStep(game, input.step, input.restart);
});
