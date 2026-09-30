import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Match the "@/..." paths the app uses.
      "@": root,
      // `server-only` is a build-time guard Next resolves itself; under
      // the test runner it has no meaning, so point it at a no-op.
      "server-only": `${root}test/stubs/server-only.ts`,
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
  },
});
