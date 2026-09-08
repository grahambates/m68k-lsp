import process from "68kcounter";

// 68kcounter's named exports are re-exported via a dynamic loop rather than
// static `exports.x = ...` assignments, which defeats static CJS/ESM interop
// detection. In the browser (dev server and production build), Vite's
// dependency pre-bundler can't tell the package has real named exports and
// falls back to CJS-style interop, so the default import resolves to the
// whole CommonJS module.exports object rather than its `default` property.
// Under Vitest's SSR/Node module pipeline this doesn't happen and `process`
// is already the real function. Handle both shapes.
const wrapped = process as unknown as { default?: typeof process };
export const parse: typeof process =
  typeof wrapped.default === "function" ? wrapped.default : process;
