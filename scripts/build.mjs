import { copyFile, mkdir, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const args = new Set(process.argv.slice(2));
const require = createRequire(import.meta.url);

const serverDir = join(root, "packages/server");
const clientDir = join(root, "packages/client");
const serverOut = join(serverDir, "out");
const clientOut = join(clientDir, "out");

const shared = {
  bundle: true,
  platform: "node",
  // The VS Code extension host loads CommonJS, and a CJS bundle doubles as the
  // npm `bin` for editors that launch the server directly.
  format: "cjs",
  target: "node20",
  minify: args.has("--minify"),
  sourcemap: args.has("--sourcemap"),
  logLevel: "info",
};

/**
 * web-tree-sitter's emscripten glue resolves its runtime wasm as
 * `__dirname + "/tree-sitter.wasm"`, so a copy has to sit beside every bundle
 * that includes it. The grammar and vasm binaries are instead looked up as
 * `__dirname/../wasm`, so they go one level up from the bundle.
 */
const treeSitterWasm = join(
  dirname(require.resolve("web-tree-sitter/package.json")),
  "tree-sitter.wasm",
);

async function copyAssets() {
  const wasmSrc = join(serverDir, "wasm");
  const entries = await readdir(wasmSrc);

  for (const [outDir, pkgDir] of [
    [serverOut, serverDir],
    [clientOut, clientDir],
  ]) {
    await mkdir(outDir, { recursive: true });
    await mkdir(join(pkgDir, "wasm"), { recursive: true });
    await copyFile(treeSitterWasm, join(outDir, "tree-sitter.wasm"));
    if (pkgDir !== serverDir) {
      for (const entry of entries) {
        await copyFile(join(wasmSrc, entry), join(pkgDir, "wasm", entry));
      }
    }
  }
}

/** The .vsix ships the server beside the client, so the extension is self-contained. */
async function copyServer() {
  await mkdir(clientOut, { recursive: true });
  await copyFile(join(serverOut, "server.js"), join(clientOut, "server.js"));
}

/**
 * Copies on every successful build, not just once after the initial one.
 * In watch mode the extension would otherwise keep launching the server
 * bundle as it stood when watch started.
 */
const copyServerPlugin = {
  name: "copy-server",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length) return;
      await copyServer();
    });
  },
};

const server = {
  ...shared,
  entryPoints: [join(serverDir, "src/server.ts")],
  outfile: join(serverOut, "server.js"),
  plugins: [copyServerPlugin],
};

const client = {
  ...shared,
  entryPoints: [join(clientDir, "src/extension.ts")],
  outfile: join(clientOut, "extension.js"),
  // Supplied by the extension host, never bundled.
  external: ["vscode"],
};

await copyAssets();

if (args.has("--watch")) {
  const contexts = await Promise.all([
    esbuild.context(server),
    esbuild.context(client),
  ]);
  await Promise.all(contexts.map((c) => c.watch()));
} else {
  await Promise.all([esbuild.build(server), esbuild.build(client)]);
}
