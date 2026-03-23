import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import devtools from "solid-devtools/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const rootDir = fileURLToPath(new URL(".", import.meta.url));
  const env = loadEnv(mode, rootDir, "");
  const apiTarget = env.VITE_API_TARGET || "http://localhost:8000";

  return {
    plugins: [
      mode !== "production" && devtools(),
      tanstackRouter({ target: "solid", autoCodeSplitting: true }),
      solid(),
    ],
    resolve: {
      alias: {
        "~": fileURLToPath(new URL("./src", import.meta.url)),
        "@bakarr/shared": fileURLToPath(
          new URL("../../packages/shared/src/index.ts", import.meta.url),
        ),
      },
    },

    server: {
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/images": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
