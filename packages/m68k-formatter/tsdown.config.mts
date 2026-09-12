import { defineConfig } from "tsdown";
export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  outDir: "out",
  format: "cjs",
  platform: "node",
  target: "node22",
  fixedExtension: false,
  dts: true,
  clean: true,
});
