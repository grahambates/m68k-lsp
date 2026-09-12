/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: [
    "<rootDir>/packages/m68k-lsp-server",
    "<rootDir>/apps/m68k-lsp",
    "<rootDir>/packages/m68k-formatter",
  ],
  moduleNameMapper: {
    "^m68k-formatter$": "<rootDir>/packages/m68k-formatter/src/index.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: "<rootDir>/packages/m68k-lsp-server/tsconfig.test.json" },
    ],
  },
};
