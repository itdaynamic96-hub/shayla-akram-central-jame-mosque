import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  publicDir: false,
  worker: { format: "es" },
  build: {
    target: "esnext",
    outDir: "assets/svara-build",
    emptyOutDir: true,
    rollupOptions: {
      input: "svara-engine.js",
      preserveEntrySignatures: "strict",
      output: {
        entryFileNames: "engine.js",
        chunkFileNames: "chunk-[hash].js",
        assetFileNames: "asset-[hash][extname]"
      }
    }
  }
});
