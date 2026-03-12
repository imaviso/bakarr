import path from "path";
import { defineConfig, loadEnv } from "vite";
import solid from "vite-plugin-solid";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import devtools from "solid-devtools/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const apiTarget = env.VITE_API_TARGET || "http://localhost:8000";

	return {
		plugins: [
			mode !== "production" && devtools(),
			tanstackRouter({ target: "solid", autoCodeSplitting: true }),
			solid(),
		],
		resolve: {
			alias: {
				"~": path.resolve(__dirname, "./src"),
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
