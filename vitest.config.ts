import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    environmentMatchGlobs: [["tests/web/**", "jsdom"]],
    setupFiles: ["tests/web/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
