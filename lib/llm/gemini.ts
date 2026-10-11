import { ApiError, GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { LLMError, type LLMProvider, type LLMRequest } from "./provider";

/** Converte uno schema Zod nel sottoinsieme di JSON Schema accettato da Gemini. */
export function toGeminiJsonSchema(schema: z.ZodType): unknown {
  const json = z.toJSONSchema(schema, { target: "draft-2020-12", unrepresentable: "any" }) as Record<string, unknown>;
  return stripUnsupported(json);
}

const SUPPORTED_KEYS = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum", "items",
  "prefixItems", "minItems", "maxItems", "minimum", "maximum", "anyOf", "oneOf", "properties",
  "additionalProperties", "required", "propertyOrdering",
]);

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (!SUPPORTED_KEYS.has(k)) continue;
    if (k === "properties" && v && typeof v === "object") {
      out[k] = Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, stripUnsupported(pv)]));
    } else if (k === "minimum" || k === "maximum") {
      // zod aggiunge i limiti dei safe integer: inutili e a volte rifiutati
      if (typeof v === "number" && Math.abs(v) < Number.MAX_SAFE_INTEGER) out[k] = v;
    } else {
      out[k] = stripUnsupported(v);
    }
  }
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function geminiProvider(): LLMProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  return {
    name: `gemini:${model}`,
    async generate<T>(req: LLMRequest<T>): Promise<T> {
      if (!apiKey) throw new LLMError("GEMINI_API_KEY non configurata sul server.", false);
      const ai = new GoogleGenAI({ apiKey });
      const responseJsonSchema = toGeminiJsonSchema(req.schema);
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await ai.models.generateContent({
            model,
            contents: req.prompt,
            config: {
              systemInstruction: req.system,
              responseMimeType: "application/json",
              responseJsonSchema,
              temperature: 1,
              maxOutputTokens: 32768,
            },
          });
          const text = res.text;
          if (!text) throw new LLMError("Risposta vuota dal modello.", true);
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            throw new LLMError("Il modello ha restituito JSON non valido.", true);
          }
          const result = req.schema.safeParse(parsed);
          if (!result.success) {
            throw new LLMError(`Output non conforme allo schema: ${z.prettifyError(result.error).slice(0, 500)}`, true);
          }
          return result.data;
        } catch (err) {
          lastError = err;
          if (err instanceof ApiError) {
            const retryable = err.status === 429 || err.status >= 500;
            if (err.status === 404) {
              throw new LLMError(`Il modello "${model}" non è disponibile: controlla GEMINI_MODEL (vedi Google AI Studio).`, false);
            }
            if (!retryable) throw new LLMError(`Errore Gemini ${err.status}: ${err.message}`, false);
            if (attempt < 2) await sleep(err.status === 429 ? 8000 * (attempt + 1) : 2000 * (attempt + 1));
            continue;
          }
          if (err instanceof LLMError && err.retryable && attempt < 2) continue;
          throw err;
        }
      }
      if (lastError instanceof ApiError) {
        throw new LLMError(
          lastError.status === 429
            ? "Limite del piano gratuito Gemini raggiunto: riprova tra qualche minuto."
            : `Gemini non disponibile (${lastError.status}).`,
          true,
        );
      }
      throw lastError instanceof Error ? lastError : new LLMError("Errore sconosciuto dal modello.", true);
    },
  };
}
