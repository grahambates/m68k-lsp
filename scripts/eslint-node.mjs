import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "out/**",
      "node_modules/**",
      "coverage/**",
      ".vscode-test/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.vitest } },
    rules: {
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
    files: ["**/*.js", "**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
);
