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
  standaloneComment?:
    | "ignore"
    | "nearest"
    | "label"
    | "mnemonic"
    | "operands"
    | "comment"
    | "operator"
    | "value"
    | number;
  indentStyle?: "space" | "tab";
  tabSize?: number;
  autoExtend?: "line" | "file" | "block";
};

type ElementRange = { start: number; end: number };

interface ElementInfo {
  range: ElementRange;
  edited?: ElementRange;
}

interface LineInfo {
  text: string;
  label?: ElementInfo;
  block: number;
  mnemonic?: ElementInfo;
  operands?: ElementInfo;
  operator?: ElementInfo;
  value?: ElementInfo;
  comment?: ElementInfo;
}

// TODO:
// label position?
// indent conditional blocks?
// disable autoExtend per component?

class AlignFormatter implements Formatter {
  private shiftWidth: number;
  private char: string;
  private block = 0;

  constructor(private options: AlignOptions) {
    const useTab = options.indentStyle === "tab";
    const tabSize = options.tabSize ?? 8;
    this.shiftWidth = useTab ? tabSize : 1;
    this.char = useTab ? "\t" : " ";
  }

  format(tree: Parser.Tree, prevEdits: TextEdit[] = []): TextEdit[] {
    const edits: TextEdit[] = [];
    this.block = 0;

    const { autoExtend } = this.options;
    let mnemonicPosition = this.options.mnemonic ?? 0;
    let operandsPosition = this.options.operands ?? 0;
    let commentPosition = this.options.comment ?? 0;
    let operatorPosition = this.options.operator ?? 0;
    let valuePosition = this.options.value ?? 0;
    const standaloneComment = this.options.standaloneComment ?? "nearest";

    const lines = tree.rootNode.text
      .split(/\r\n?|\n/)
      .map((text, i) => this.processLine(text, i, prevEdits));

    // For files we only need to calculate adjustments once
    let autoExtended = false;

    for (let line = 0; line < lines.length; line++) {
      const {
        label,
        mnemonic,
        operands,
        operator,
        value,
        comment,
        text,
        block,
      } = lines[line];

      const labelPosition = 0;

      if (autoExtend === "block" || (autoExtend === "file" && !autoExtended)) {
        let compareLines = lines;
        if (autoExtend === "file") {
          // Flag to avoid reporocessing on each iteration for file mode
          autoExtended = true;
        } else {
          // In block mode limit lines for comparison to those in the same block
          compareLines = lines.filter((l) => l.block === block);
        }

        const max = (values: number[]) =>
          Math.ceil((Math.max(...values) + 1) / this.shiftWidth);

        const maxLabelToMnemonic = max(
          compareLines
            .filter((l) => l.label && l.mnemonic)
            .map((l) => elementLength(l.label))
        );
        const maxMnemonicToOperands = max(
          compareLines
            .filter((l) => l.mnemonic && l.operands)
            .map((l) => elementLength(l.mnemonic))
        );
        const maxLabelToOperator = max(
          compareLines
            .filter((l) => l.label && l.operator)
            .map((l) => elementLength(l.label))
        );
        // Currently always 1
        const maxOperatorToValue = max(
          compareLines
            .filter((l) => l.operator && l.value)
            .map((l) => elementLength(l.operator))
        );
        const maxOperandsToComment = max(
          compareLines
            .filter((l) => l.operands && l.comment)
            .map((l) => elementLength(l.operands))
        );
        const maxMnemonicToComment = max(
          compareLines
            .filter((l) => l.mnemonic && !l.operands && l.comment)
            .map((l) => elementLength(l.mnemonic))
        );
        const maxLabelToComment = max(
          compareLines
            .filter((l) => l.label && !l.mnemonic && l.comment)
            .map((l) => elementLength(l.label))
        );
        const maxValueToComment = max(
          compareLines
            .filter((l) => l.value && l.comment)
            .map((l) => elementLength(l.value))
        );

        mnemonicPosition = Math.max(
          labelPosition + maxLabelToMnemonic,
          this.options.mnemonic ?? 0
        );
        operandsPosition = Math.max(
          mnemonicPosition + maxMnemonicToOperands,
          this.options.operands ?? 0
        );
        // TODO: should operator and mnemonic be merged if no specific config?
        operatorPosition = Math.max(
          labelPosition + maxLabelToOperator,
          this.options.operator ?? 0
        );
        valuePosition = Math.max(
          operatorPosition + maxOperatorToValue,
          this.options.value ?? 0
        );
        commentPosition = Math.max(
          operandsPosition + maxOperandsToComment,
          mnemonicPosition + maxMnemonicToComment,
          labelPosition + maxLabelToComment,
          valuePosition + maxValueToComment,
          this.options.comment ?? 0
        );
      }

      const editor = new LineEditor(text, line, this.shiftWidth, this.char);

      if (label) {
        editor.addIndent(labelPosition, label, 0);
      }
      if (mnemonic) {
        editor.addIndent(mnemonicPosition, mnemonic);
      }
      if (operands) {
        editor.addIndent(operandsPosition, operands);
      }
      if (operator) {
        editor.addIndent(operatorPosition, operator);
      }
      if (value) {
        editor.addIndent(valuePosition, value);
      }
      if (comment) {
        if (!label && !mnemonic && !operands && !operator && !value) {
          if (standaloneComment) {
            if (typeof standaloneComment === "number") {
              // Literal position
              editor.addIndent(standaloneComment, comment, 0);
            } else if (standaloneComment === "nearest") {
              // Find nearest position:
              const possiblePositions = [
                labelPosition,
                mnemonicPosition,
                operandsPosition,
                commentPosition,
                operatorPosition,
                valuePosition,
              ];
              // Calculate absolute delta from each position
              const positionDeltas = possiblePositions.map((o) =>
                Math.abs(o - comment.range.start)
              );
              // Use index of smallest delta
              const minDelta = Math.min(...positionDeltas);
              const minDeltaIndex = positionDeltas.indexOf(minDelta);
              editor.addIndent(possiblePositions[minDeltaIndex], comment, 0);
            } else if (typeof standaloneComment === "string") {
              // Named position
              const indent =
                this.options[standaloneComment as keyof AlignOptions];
              if (typeof indent === "number") {
                editor.addIndent(indent, comment, 0);
              } else {
                editor.addIndent(0, comment, 0);
              }
            }
          }
        } else {
          editor.addIndent(commentPosition, comment);
        }
      }

      edits.push(...editor.edits);
    }

    return edits;
  }

  processLine(text: string, line: number, prevEdits: TextEdit[]): LineInfo {
    if (text.match(/^\s*$/)) {
      this.block++;
      return { text, block: this.block };
    }

    const lineInfo: LineInfo = { text, block: this.block };
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
}

class LineEditor {
  readonly edits: TextEdit[] = [];

  // Tracks position and character offset as we apply indents
  private previousEnd = 0;
  private offset = 0;

  constructor(
    private text: string,
    private line: number,
    private shiftWidth: number,
    private char: string
  ) {}

  /**
   * Creates edits to adjust indent and align element at desired position
   *
   * @param position Desired column/tab position for element
   * @param elementInfo Ranges of element before and after previous edits
   * @param min Minimum space from previous element
   */
  addIndent(
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
      newText !== this.text.substring(this.previousEnd, range.start);

    if (editRequired) {
      this.edits.push({
        range: {
          start: { character: this.previousEnd, line: this.line },
          end: { character: range.start, line: this.line },
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

function elementLength(info?: ElementInfo) {
  if (info?.edited) {
    return info.edited.end - info.edited.start;
  }
  return 0;
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
