import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    ...tanstackStart({
      server: { entry: "server" },
      // Existing route loaders call server modules directly. Keep the current
      // application contract while those boundaries are migrated incrementally.
      importProtection: { enabled: false },
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  nitro: {
    preset: "node-server",
  },
  server: {
    allowedHosts: ["djiwatravel.com", "www.djiwatravel.com"],
  },
});
