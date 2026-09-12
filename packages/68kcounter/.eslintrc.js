module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
  ],
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: "module",
  },
  env: {
    node: true,
    jest: true,
    es6: true,
  },
  rules: {
    "prettier/prettier": "error",
  },
  plugins: ["import", "@typescript-eslint/eslint-plugin"],
  settings: {
    "import/resolver": {
      node: {
        extensions: [".js", ".jsx", ".ts"],
      },
    },
  },
};
