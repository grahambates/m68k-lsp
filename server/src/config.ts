import { Processor } from "./docs";
import { FormatterOptions } from "./formatter/DocumentFormatter";
import * as os from "os";
import { VasmOptions } from "./diagnostics";

export interface Config {
  format: FormatterOptions;
  includePaths: string[];
  processors: Processor[];
  vasm: VasmOptions;
}

const defaultConfig: Config = {
  format: {
    case: "lower",
    labelColon: "on",
    quotes: "double",
    operandSpace: "off",
    align: {
      mnemonic: 8,
      operands: 16,
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
  vasm: {
    provideDiagnostics: true,
    preferWasm: false,
    binPath: os.platform() === "win32" ? "vasmm68k_mot.exe" : "vasmm68k_mot",
    args: [],
    exclude: [],
  },
};

export function mergeDefaults(config: Partial<Config>): Config {
  return {
    ...defaultConfig,
    ...config,
    format: {
      ...defaultConfig.format,
      ...config?.format,
      align: {
        ...defaultConfig.format.align,
        ...config?.format?.align,
      },
    },
    vasm: {
      ...defaultConfig.vasm,
      ...config?.vasm,
    },
  };
}
