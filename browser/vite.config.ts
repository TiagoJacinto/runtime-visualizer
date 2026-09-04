import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { frontmanPlugin } from "@frontman-ai/vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		frontmanPlugin({ host: "api.frontman.sh" }),
		tailwindcss(),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
	server: {
		allowedHosts: ["thinkcentre.tail4aacd1.ts.net"],
		// Proxy /api/* to the Fastify backend so the React UI can develop against a
		// single origin. Default port is the Fastify server's default
		// (3000); set VITE_API_PORT to override.
		proxy: {
			"/api": {
				target: `http://127.0.0.1:${process.env.VITE_API_PORT ?? "3000"}`,
				changeOrigin: false,
			},
		},
	},
});
