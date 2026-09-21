import { frontmanPlugin } from "@frontman-ai/vite";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
    // single origin. The root dev coordinator sets VITE_API_PORT when it
    // selects a free backend port; standalone frontend development defaults to
    // the backend's default port (3000).
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.VITE_API_PORT ?? "3000"}`,
        changeOrigin: false,
      },
    },
  },
});
