import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "packages/m68k-lsp-server/test/**/*.test.ts",
      "apps/m68k-lsp/test/**/*.test.ts",
      "packages/m68k-formatter/test/**/*.test.ts",
    ],
  },
});
