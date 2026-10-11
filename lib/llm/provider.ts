import type { z } from "zod";
import type { Details, GenerationContext, Plot } from "@/lib/game/schemas";

export type GenerationStep = "plot" | "details" | "script";

export interface LLMRequest<T> {
  step: GenerationStep;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Dati strutturati usati dal provider mock (gli altri provider usano solo il prompt). */
  context: GenerationContext;
  previous: { plot?: Plot; details?: Details };
}

export interface LLMProvider {
  name: string;
  generate<T>(req: LLMRequest<T>): Promise<T>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}
