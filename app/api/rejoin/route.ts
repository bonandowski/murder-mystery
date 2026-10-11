import { z } from "zod";
import { handler, readJson } from "@/lib/server/http";
import { rejoin } from "@/lib/server/lobby";

const body = z.object({ token: z.string().min(10).max(100) });

export const POST = handler(async (req) => rejoin((await readJson(req, body)).token));
