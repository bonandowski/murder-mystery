import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Richiede: Supabase locale avviato (`npx supabase start`) e app in esecuzione
// con LLM_PROVIDER=mock (`npm run dev`). APP_URL di default: http://localhost:3000
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: loadEnv("", process.cwd(), ""),
  },
});
