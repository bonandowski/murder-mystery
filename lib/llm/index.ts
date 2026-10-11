import { geminiProvider } from "./gemini";
import { mockProvider } from "./mock";
import type { LLMProvider } from "./provider";

export function getProvider(): LLMProvider {
  const name = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
  if (name === "mock") return mockProvider;
  return geminiProvider();
}
