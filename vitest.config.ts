import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Same `@/` alias tsconfig gives the app, so tests can reach lib/ modules
    // without relative-path gymnastics.
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["harness/**/*.test.ts", "lib/**/*.test.ts"],
  },
});
