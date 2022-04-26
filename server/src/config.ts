import { FormatterOptions } from "./formatter/DocumentFormatter";

export interface Config {
  format: FormatterOptions;
  includePaths: string[];
}

export const defaultConfig: Config = {
  format: {
    case: {
      directive: "lower",
      instruction: "lower",
      sectionType: "lower",
    },
    labelColon: {
      global: "on",
      local: "off",
    },
    quotes: "double",
    align: {
      mnemonic: 2,
      operands: 3,
      comment: 5,
      indentStyle: "tab",
      tabSize: 8,
    },
    trimWhitespace: false,
    finalNewLine: true,
    endOfLine: "lf",
  },
  includePaths: [],
};
