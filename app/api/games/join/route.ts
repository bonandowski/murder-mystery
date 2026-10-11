import { z } from "zod";
import { handler, readJson } from "@/lib/server/http";
import { joinGame } from "@/lib/server/lobby";

const body = z.object({
  code: z.string().max(12),
  nickname: z.string().max(40).default(""),
  pref: z.enum(["m", "f", "any"]).default("any"),
  spectator: z.boolean().default(false),
});

export const POST = handler(async (req) => joinGame(await readJson(req, body)));
