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
  external: [/\.node$/u, "better-sqlite3", "bindings", "file-uri-to-path"],
});
