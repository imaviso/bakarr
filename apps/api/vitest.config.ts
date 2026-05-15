import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@packages/shared": path.resolve(import.meta.dirname, "../../packages/shared/src"),
    },
  },
  test: {
    server: {
      deps: {
        inline: [
          /^@effect\/sql(?:$|\/)/,
          /^@effect\/sql-drizzle(?:$|\/)/,
          /^@effect\/sql-sqlite-node(?:$|\/)/,
        ],
      },
    },
    environment: "node",
    fileParallelism: false,
    include: ["**/*_test.ts"],
    testTimeout: 30_000,
  },
});
