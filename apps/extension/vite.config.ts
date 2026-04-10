import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "argument-critic-extension-assets",
      async closeBundle() {
        const source = resolve(__dirname, "dist", "src", "sidepanel", "index.html");
        const target = resolve(__dirname, "dist", "sidepanel.html");
        await copyFile(source, target);
        await copyFile(resolve(__dirname, "public", "welcome.html"), resolve(__dirname, "dist", "welcome.html"));
        await copyFile(resolve(__dirname, "public", "welcome.js"), resolve(__dirname, "dist", "welcome.js"));
      }
    }
  ],
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
        background: resolve(__dirname, "src/background/serviceWorker.ts"),
        cropOverlay: resolve(__dirname, "src/content/cropOverlay.ts")
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "background") {
            return "background.js";
          }

          if (chunkInfo.name === "cropOverlay") {
            return "cropOverlay.js";
          }

          return "assets/[name].js";
        },
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]"
      }
    }
  }
});