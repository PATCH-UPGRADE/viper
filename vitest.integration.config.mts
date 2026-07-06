import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests run against a LIVE VIPER container + the other service's
// container (see docker/ci/compose.blueflow.yml). Node environment, no
// jsdom/react setup, longer timeouts for cross-container HTTP.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
