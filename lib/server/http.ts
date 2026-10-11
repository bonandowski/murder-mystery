import type { z } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown = {};
  try {
    const text = await req.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "JSON non valido");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, "Richiesta non valida");
  return parsed.data;
}

/** Wrapper per le route: risposte JSON uniformi ed errori leggibili. */
export function handler<C>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const data = await fn(req, ctx);
      return Response.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return Response.json({ error: "Errore interno del server" }, { status: 500 });
    }
  };
}
