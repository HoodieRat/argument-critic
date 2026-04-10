import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: resolve(__dirname, "src/renderer"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "dist/renderer"),
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        app: resolve(__dirname, "src/renderer/index.html"),
        cropOverlay: resolve(__dirname, "src/renderer/crop-overlay.html")
      }
    }
  }
});