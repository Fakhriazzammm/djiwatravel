import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import path from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    ...tanstackStart({
      server: { entry: "server" },
      // Keep server-only route loaders and provider modules out of the browser bundle.
      // Without this protection a server module can evaluate in the browser and abort
      // hydration before React attaches any button or form handlers.
      importProtection: {
        enabled: true,
        behavior: { dev: "mock", build: "error" },
      },
    }),
    nitro({ preset: "node-server" }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    allowedHosts: ["djiwatravel.com", "www.djiwatravel.com"],
  },
});
