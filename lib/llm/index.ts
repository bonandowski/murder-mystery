import { geminiProvider } from "./gemini";
import { mockProvider } from "./mock";
import type { LLMProvider } from "./provider";

/**
 * LLM_PROVIDER: "gemini" | "mock". Se non impostato: Gemini quando c'è GEMINI_API_KEY,
 * altrimenti la storia di esempio (così il primo deploy funziona anche senza chiave).
 */
export function providerName(): "gemini" | "mock" {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === "mock" || explicit === "gemini") return explicit;
  return process.env.GEMINI_API_KEY ? "gemini" : "mock";
}

export function getProvider(): LLMProvider {
  return providerName() === "mock" ? mockProvider : geminiProvider();
}
