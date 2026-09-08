/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // 68kcounter's default export gets re-exported via a dynamic __exportStar
    // loop that esbuild can't statically analyze, so its CJS/ESM interop
    // detection misses the default export and needs to be forced.
    needsInterop: ["68kcounter"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
  },
});
