#!/usr/bin/env node
import * as esbuild from "esbuild";

const sharedConfig = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  sourcemap: true,
  external: [], // No external dependencies to bundle
  platform: "neutral", // Works in both Node and browser
};

// ESM build
await esbuild.build({
  ...sharedConfig,
  format: "esm",
  outfile: "dist/index.mjs",
});

// CJS build
await esbuild.build({
  ...sharedConfig,
  format: "cjs",
  outfile: "dist/index.cjs",
});

console.log("✓ Build complete");
