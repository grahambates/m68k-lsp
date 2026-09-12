// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // An unused parameter is how `lintOne(path, options, config)` carried a
      // dead argument for several releases. Allow a leading underscore to say
      // "deliberately unused".
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-else-return": "error",
      "object-shorthand": ["error", "properties"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },

  // The CLI and the doc generator are console programs.
  {
    files: ["src/cli/**/*.ts", "scripts/**/*.mjs"],
    rules: { "no-console": "off" },
  },

  // Everything else is a library: printing is a side effect a linter should not have.
  {
    files: ["src/**/*.ts"],
    ignores: ["src/cli/**/*.ts", "src/test/**/*.ts"],
    rules: { "no-console": "error" },
  },

  {
    files: ["src/test/**/*.ts"],
    rules: {
      // Fixtures intentionally assert on loosely typed diagnostic `data` bags.
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },

  // Config and build scripts are plain Node ESM, outside the TS project.
  {
    files: ["*.js", "*.mjs", "*.mts", "scripts/**/*.{js,mjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { console: "readonly", process: "readonly", URL: "readonly", URLSearchParams: "readonly" },
    },
  },

  // Must stay last: turns off everything Prettier owns.
  prettier,
);
