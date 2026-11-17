import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test", "@convex-dev/rate-limiter"] } },
    include: ["convex/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
