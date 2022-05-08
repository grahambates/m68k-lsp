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
    operandSpace: "off",
    align: {
      mnemonic: 12,
      operands: 22,
      comment: 48,
      operator: 0,
      value: 0,
      indentStyle: "space",
      tabSize: 8,
      autoExtend: "line",
    },
    trimWhitespace: false,
    finalNewLine: true,
    endOfLine: "lf",
  },
  includePaths: [],
  processors: ["mc68000"],
};
