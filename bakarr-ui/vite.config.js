import path from "path";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import devtools from "solid-devtools/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
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
				target: "http://localhost:6789",
				changeOrigin: true,
			},
			"/images": {
				target: "http://localhost:6789",
				changeOrigin: true,
			},
		},
	},
}));
