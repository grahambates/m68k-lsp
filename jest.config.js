/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: [
    "<rootDir>/packages/server",
    "<rootDir>/packages/client",
    "<rootDir>/packages/formatter",
  ],
  moduleNameMapper: {
    "^m68k-formatter$": "<rootDir>/packages/formatter/src/index.ts",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: "<rootDir>/packages/server/tsconfig.test.json" },
    ],
  },
};
