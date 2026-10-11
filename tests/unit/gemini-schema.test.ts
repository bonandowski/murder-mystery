import { describe, expect, it } from "vitest";
import { detailsSchema, plotSchema, scriptSchema } from "@/lib/game/schemas";
import { toGeminiJsonSchema } from "@/lib/llm/gemini";

const ALLOWED = new Set([
  "$id", "$defs", "$ref", "$anchor", "type", "format", "title", "description", "enum", "items",
  "prefixItems", "minItems", "maxItems", "minimum", "maximum", "anyOf", "oneOf", "properties",
  "additionalProperties", "required", "propertyOrdering",
]);

function keysDeep(node: unknown, out = new Set<string>(), inProps = false): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => keysDeep(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (!inProps) out.add(k);
      keysDeep(v, out, k === "properties" && !inProps);
    }
  }
  return out;
}

describe("schema JSON per Gemini", () => {
  it.each([["plot", plotSchema], ["details", detailsSchema], ["script", scriptSchema]] as const)(
    "%s usa solo chiavi supportate",
    (_, schema) => {
      const json = toGeminiJsonSchema(schema) as Record<string, unknown>;
      expect(json.type).toBe("object");
      for (const k of keysDeep(json)) expect(ALLOWED.has(k)).toBe(true);
    },
  );
});
