import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";
import AlignFormatter, { AlignOptions } from "./formatters/AlignFormatter";
import CaseFormatter, { CaseOptions } from "./formatters/CaseFormatter";
import EndOfLineFormatter from "./formatters/EndOfLineFormatter";
import LabelColonFormatter, {
  LabelColonOptions,
} from "./formatters/LabelColonFormatter";
import OperandSpaceFormatter, {
  OperandSpaceOptions,
} from "./formatters/OperandSpaceFormatter";
import QuotesFormatter, { QuotesOptions } from "./formatters/QuotesFormatter";
import TrimWhitespaceFormatter from "./formatters/TrimWhitespaceFormatter";

export interface FormatterOptions {
  align?: AlignOptions;
  case?: CaseOptions;
  endOfLine?: "lf" | "cr" | "crlf";
  finalNewLine?: boolean;
  labelColon?: LabelColonOptions;
  quotes?: QuotesOptions;
  trimWhitespace?: boolean;
  operandSpace?: OperandSpaceOptions;
  // TODO:
  // mnemonic aliases? equ vs =
  // multiple line breaks?
  // number format?
  // fix mnemononic at start of line?
  // require size qualifier?
  // C vs ASM style operators?
  // Comment style
  // label position if fits
}

export interface Formatter {
  format(tree: Parser.Tree, prevEdits: TextEdit[]): TextEdit[];
}

class DocumentFormatter {
  private formatters: Formatter[] = [];

  constructor(language: Parser.Language, options: Partial<FormatterOptions>) {
    if (options.case) {
      this.formatters.push(new CaseFormatter(language, options.case));
    }
    if (options.labelColon) {
      this.formatters.push(
        new LabelColonFormatter(language, options.labelColon)
      );
    }
    if (options.quotes) {
      this.formatters.push(new QuotesFormatter(language, options.quotes));
    }
    if (options.operandSpace) {
      this.formatters.push(
        new OperandSpaceFormatter(language, options.operandSpace)
      );
    }
    if (options.align) {
      this.formatters.push(new AlignFormatter(options.align));
    }
    if (options.trimWhitespace) {
      this.formatters.push(new TrimWhitespaceFormatter());
    }
    if (options.endOfLine) {
      this.formatters.push(
        new EndOfLineFormatter(options.endOfLine, options.finalNewLine)
      );
    }
  }

  format(tree: Parser.Tree): TextEdit[] {
    const edits: TextEdit[] = [];

    for (const formatter of this.formatters) {
      edits.push(...formatter.format(tree, edits));
    }

    return edits;
  }
}

export default DocumentFormatter;
