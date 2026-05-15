import { defineConfig } from "rolldown";

export default defineConfig({
  input: "main.ts",
  output: {
    dir: "build",
    entryFileNames: "main.js",
    format: "esm",
    sourcemap: true,
  },
  platform: "node",
  external: ["better-sqlite3"],
});
