import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

import globals from "globals";

export default tseslint.config(
  { ignores: ["**/out/**", "**/node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
    },
  },
  {
    // Plain-JS build scripts and the LSP test client both run on bare Node.
    files: ["**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
);
