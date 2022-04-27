import { Processor } from "./docs";
import { FormatterOptions } from "./formatter/DocumentFormatter";

export interface Config {
  format: FormatterOptions;
  includePaths: string[];
  processors: Processor[];
}

export const defaultConfig: Config = {
  format: {
    case: "lower",
    labelColon: "on",
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
  processors: ["mc68000"],
};
