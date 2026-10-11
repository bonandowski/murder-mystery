import { z } from "zod";
import { handler, readJson } from "@/lib/server/http";
import { createGame } from "@/lib/server/lobby";

const body = z.object({ nickname: z.string().max(40), pref: z.enum(["m", "f", "any"]).default("any") });

export const POST = handler(async (req) => createGame(await readJson(req, body)));
