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

// TODO:
// label posiiton?
// auto align?
// indent conditional blocks?

class AlignFormatter implements Formatter {
  constructor(private options: AlignOptions) {}

  format(tree: Parser.Tree, prevEdits: TextEdit[] = []): TextEdit[] {
    const edits: TextEdit[] = [];

    const useTab = this.options.indentStyle === "tab";
    const tabSize = this.options.tabSize ?? 8;
    const shiftWidth = useTab ? tabSize : 1;
    const char = useTab ? "\t" : " ";

    // Using the line parser to get elements by position, rather than the document parse tree.
    // Get an array of lines to process:
    const lines = tree.rootNode.text.split(/\r\n?|\n/);

    for (let line = 0; line < lines.length; line++) {
      // Track position and character offset as we apply indents
      let previousEnd = 0;
      let offset = 0;

      const addIndent = (
        position: number,
        range: ElementRange,
        edited: ElementRange = { start: 0, end: 0 },
        min = 1
      ) => {
        const positionOffset = position - offset;
        // There's a chance the offset might be negative if the previous element is too long to position where we want.
        // In this case insert a minimum number of spaces, or none at all.
        const count = Math.max(positionOffset, min);

        // Always use spaces for min whitespace
        const newText =
          positionOffset > 0 ? char.repeat(count) : " ".repeat(count);

        edits.push({
          range: {
            start: { character: previousEnd, line },
            end: { character: range.start, line },
          },
          newText,
        });

        // Update end position
        previousEnd = range.end;

        // Update offset:
        // Use the length of the element with previous edits applied.
        // This handles cases where other formatters have changed its length e.g. adding/removing label colon, which
        // would otherwise shift the alignment of subsequent elements.
        const elementLength = edited.end - edited.start;
        offset += count + Math.floor(elementLength / shiftWidth);
      };

      const lineText = lines[line];
      const parsed = parseLine(lineText);

      // Need to look at edits to this line in case the length of any elements has changed:
      const lineEdits = prevEdits
        // Find edits that apply exclusively to this line
        .filter(
          ({ range: { start, end } }) =>
            start.line === line && end.line === line
        )
        // Convert them to apply to line 0
        .map((e) => ({
          ...e,
          range: {
            start: { ...e.range.start, line: 0 },
            end: { ...e.range.end, line: 0 },
          },
        }));

      let lineTextFinal = lineText;
      let parsedFinal = parsed;
      // If there are edits, store and parse the updated version of the line so we can adjust lengths/offsets.
      if (lineEdits.length) {
        // Create a single line document and apply changes
        const editDoc = TextDocument.create("file:///", "m68k", 1, lineText);
        lineTextFinal = TextDocument.applyEdits(editDoc, lineEdits);
        parsedFinal = parseLine(lineTextFinal);
      }

      const labelRange = getLabelRange(parsed, lineText);
      if (labelRange) {
        const edited = getLabelRange(parsedFinal, lineTextFinal);
        addIndent(0, labelRange, edited, 0);
      }

      // Is that statement a constant definition?
      // TODO: should this include EQU, EQUR, FEQ etc?
      const isOp = parsed.mnemonic?.value === "=";

      const mnemonicRange = getMnemonicRange(parsed);
      if (mnemonicRange) {
        const position = isOp
          ? this.options.operator ?? 0
          : this.options.mnemonic ?? 0;
        const edited = getMnemonicRange(parsedFinal);
        addIndent(position, mnemonicRange, edited);
      }

      const operandsRange = getOperandsRange(parsed);
      if (operandsRange) {
        const position = isOp ? this.options.value ?? 0 : this.options.operands;
        const edited = getOperandsRange(parsedFinal);
        addIndent(position ?? 0, operandsRange, edited);
      }

      if (parsed.comment && parsed.comment.start > 0) {
        addIndent(this.options.comment ?? 0, parsed.comment);
      }
    }

    return edits;
  }
}

type ElementRange = { start: number; end: number };

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
