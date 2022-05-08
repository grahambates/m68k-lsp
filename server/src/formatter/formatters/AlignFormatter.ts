import { TextEdit } from "vscode-languageserver";

import { TextDocument } from "vscode-languageserver-textdocument";
import Parser from "web-tree-sitter";

import { ParsedLine, parseLine } from "../../parse";
import { Formatter } from "../DocumentFormatter";

export type AlignOptions = {
  mnemonic?: number;
  operands?: number;
  comment?: number;
  operator?: number;
  value?: number;
  indentStyle?: "space" | "tab";
  tabSize?: number;
};

type ElementRange = { start: number; end: number };

interface ElementInfo {
  range: ElementRange;
  edited?: ElementRange;
}

interface LineInfo {
  text: string;
  label?: ElementInfo;
  mnemonic?: ElementInfo;
  operands?: ElementInfo;
  operator?: ElementInfo;
  value?: ElementInfo;
  comment?: ElementInfo;
}

// TODO:
// label posiiton?
// auto align?
// indent conditional blocks?

class AlignFormatter implements Formatter {
  constructor(private options: AlignOptions) {}

  format(tree: Parser.Tree, prevEdits: TextEdit[] = []): TextEdit[] {
    const edits: TextEdit[] = [];

    const lines = tree.rootNode.text
      .split(/\r\n?|\n/)
      .map((text, i) => processLine(text, i, prevEdits));

    const mnemonicPosition = this.options.mnemonic ?? 0;
    const operatorPosition = this.options.operator ?? 0;
    const operandsPosition = this.options.operands ?? 0;
    const valuePosition = this.options.value ?? 0;
    const commentPosition = this.options.comment ?? 0;

    for (let line = 0; line < lines.length; line++) {
      const { label, mnemonic, operands, operator, value, comment, text } =
        lines[line];

      const editor = new LineEditor(text, this.options);

      if (label) {
        editor.addIndent(line, 0, label, 0);
      }
      if (mnemonic) {
        editor.addIndent(line, mnemonicPosition, mnemonic);
      }
      if (operands) {
        editor.addIndent(line, operandsPosition, operands);
      }
      if (operator) {
        editor.addIndent(line, operatorPosition, operator);
      }
      if (value) {
        editor.addIndent(line, valuePosition, value);
      }
      if (comment) {
        editor.addIndent(line, commentPosition, comment);
      }

      edits.push(...editor.edits);
    }

    return edits;
  }
}

class LineEditor {
  readonly edits: TextEdit[] = [];

  private shiftWidth: number;
  private char: string;

  // Tracks position and character offset as we apply indents
  private previousEnd = 0;
  private offset = 0;

  constructor(private lineText: string, options: AlignOptions) {
    const useTab = options.indentStyle === "tab";
    const tabSize = options.tabSize ?? 8;
    this.shiftWidth = useTab ? tabSize : 1;
    this.char = useTab ? "\t" : " ";
  }

  /**
   * Creates edits to adjust indent and align element at desired position
   *
   * @param line Current line index for edit positions
   * @param position Desired column/tab position for element
   * @param elementInfo Ranges of element before and after previous edits
   * @param min Minimum space from previous element
   */
  addIndent(
    line: number,
    position: number,
    { range, edited = { start: 0, end: 0 } }: ElementInfo,
    min = 1
  ) {
    const positionOffset = position - this.offset;
    // There's a chance the offset might be negative if the previous element is too long to position where we want.
    // In this case insert a minimum number of spaces, or none at all.
    const count = Math.max(positionOffset, min);

    // Always use spaces for min whitespace
    const newText =
      positionOffset > 0 ? this.char.repeat(count) : " ".repeat(count);

    const editRequired =
      newText !== this.lineText.substring(this.previousEnd, range.start);

    if (editRequired) {
      this.edits.push({
        range: {
          start: { character: this.previousEnd, line },
          end: { character: range.start, line },
        },
        newText,
      });
    }

    // Update end position
    this.previousEnd = range.end;

    // Update offset:
    // Use the length of the element with previous edits applied.
    // This handles cases where other formatters have changed its length e.g. adding/removing label colon, which
    // would otherwise shift the alignment of subsequent elements.
    const elementLength = edited.end - edited.start;
    this.offset += count + Math.floor(elementLength / this.shiftWidth);
  }
}

function processLine(
  text: string,
  line: number,
  prevEdits: TextEdit[]
): LineInfo {
  const lineInfo: LineInfo = { text };
  const parsed = parseLine(text);

  // Need to look at edits to this line in case the length of any elements has changed:
  const lineEdits = prevEdits
    // Find edits that apply exclusively to this line
    .filter(
      ({ range: { start, end } }) => start.line === line && end.line === line
    )
    // Convert them to apply to line 0
    .map((e) => ({
      ...e,
      range: {
        start: { ...e.range.start, line: 0 },
        end: { ...e.range.end, line: 0 },
      },
    }));

  let lineTextFinal = text;
  let parsedFinal = parsed;
  // If there are edits, store and parse the updated version of the line so we can adjust lengths/offsets.
  if (lineEdits.length) {
    // Create a single line document and apply changes
    const editDoc = TextDocument.create("file:///", "m68k", 1, text);
    lineTextFinal = TextDocument.applyEdits(editDoc, lineEdits);
    parsedFinal = parseLine(lineTextFinal);
  }

  const labelRange = getLabelRange(parsed, text);
  if (labelRange) {
    const edited = getLabelRange(parsedFinal, lineTextFinal);
    lineInfo.label = { range: labelRange, edited };
  }

  // Is that statement a constant definition?
  // TODO: should this include EQU, EQUR, FEQ etc?
  const isOp = parsed.mnemonic?.value === "=";

  const mnemonicRange = getMnemonicRange(parsed);
  if (mnemonicRange) {
    const edited = getMnemonicRange(parsedFinal);
    if (isOp) {
      lineInfo.operator = { range: mnemonicRange, edited };
    } else {
      lineInfo.mnemonic = { range: mnemonicRange, edited };
    }
  }

  const operandsRange = getOperandsRange(parsed);
  if (operandsRange) {
    const edited = getOperandsRange(parsedFinal);
    if (isOp) {
      lineInfo.value = { range: operandsRange, edited };
    } else {
      lineInfo.operands = { range: operandsRange, edited };
    }
  }

  if (parsed.comment && parsed.comment.start > 0) {
    lineInfo.comment = { range: parsed.comment };
  }

  return lineInfo;
}

function getLabelRange(
  { label }: ParsedLine,
  lineText: string
): ElementRange | undefined {
  if (label) {
    let end = label.end;
    while (lineText.charAt(end) === ":") {
      end++;
    }
    return { start: label.start, end };
  }
}

function getMnemonicRange({
  mnemonic,
  size,
}: ParsedLine): ElementRange | undefined {
  if (mnemonic) {
    return {
      start: mnemonic.start,
      end: size?.end ?? mnemonic.end,
    };
  }
}

function getOperandsRange({ operands }: ParsedLine): ElementRange | undefined {
  if (operands) {
    return {
      start: operands[0].start,
      end: operands[operands.length - 1].end,
    };
  }
}

export default AlignFormatter;
