const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const prettier = require("eslint-config-prettier");
const globals = require("globals");

module.exports = tseslint.config(
  {
    ignores: [
      "packages/m68k-parser/**",
      "packages/68kcounter/**",
      "packages/m68k-lint/**",
      "packages/m68k-lint-langserver/**",
      "apps/68kcounter-*/**",
      "apps/m68k-lint-vscode/**",
      "docs/imported-m68k-lint-lsp/**",
      "**/node_modules/**",
      "**/out/**",
      "**/.tsbuild/**",
      "**/wasm/**",
      "**/coverage/**",
      "apps/m68k-lsp/syntaxes/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // Underscore-prefixed bindings are intentional throwaways, and catch
      // clauses that ignore the error are common in the file-probing helpers.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
        },
      ],
    },
  },
  {
    // Plain CommonJS entry points, not TypeScript sources.
    files: ["**/*.js", "**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    files: ["packages/*/test/**/*.ts", "apps/*/test/**/*.ts"],
    languageOptions: {
      globals: { ...globals.vitest },
    },
  },
  prettier,
);
