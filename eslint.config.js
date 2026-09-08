import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import prettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "build", "coverage"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  reactHooks.configs.flat["recommended-latest"],
  prettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: "detect" },
      "import/resolver": {
        typescript: true,
      },
    },
    rules: {
      "react/prop-types": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      // eslint-plugin-import misidentifies typescript-eslint's default export as ambiguous
      "import/no-named-as-default-member": "off",
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/setupTests.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
);
