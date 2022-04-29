import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";

import { parseLine } from "../../parse";
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

  format(tree: Parser.Tree): TextEdit[] {
    const edits: TextEdit[] = [];

    const useTab = this.options.indentStyle === "tab";
    const tabSize = this.options.tabSize ?? 8;
    const shiftWidth = useTab ? tabSize : 1;
    const char = useTab ? "\t" : " ";

    const lines = tree.rootNode.text.split(/\r\n?|\n/);

    for (let line = 0; line < lines.length; line++) {
      let previousEnd = 0;
      let offset = 0;

      const lineText = lines[line];
      const { label, mnemonic, size, operands, comment } = parseLine(lineText);

      const addIndent = (
        position: number,
        start: number,
        end: number,
        min = 1
      ) => {
        const desiredCount = position - offset;
        const count = Math.max(desiredCount, min);

        // ALways use spaces for min whitespace
        const newText =
          desiredCount > 0 ? char.repeat(count) : " ".repeat(count);

        edits.push({
          range: {
            start: { character: previousEnd, line },
            end: { character: start, line },
          },
          newText,
        });

        previousEnd = end;
        offset += count + Math.floor((end - start) / shiftWidth);
      };

      if (label) {
        let end = label.end;
        // Adjust to include trailing semicolon(s)
        while (lineText.charAt(end) === ":") {
          end++;
        }
        addIndent(0, label.start, end, 0);
      }

      // Is that statement a constant definition?
      // TODO: should this include EQU, EQUR, FEQ etc?
      const isOp = mnemonic?.value === "=";

      if (mnemonic) {
        const position = isOp
          ? this.options.operator ?? 0
          : this.options.mnemonic ?? 0;
        // Extend element to end of size
        const end = size?.end ?? mnemonic.end;
        addIndent(position, mnemonic.start, end);
      }

      if (operands) {
        const position = isOp ? this.options.value ?? 0 : this.options.operands;
        // Extend to all operands
        const end = operands[operands.length - 1].end;
        addIndent(position ?? 0, operands[0].start, end);
      }

      if (comment && comment.start > 0) {
        addIndent(this.options.comment ?? 0, comment.start, comment.end);
      }
    }

    return edits;
  }
}

export default AlignFormatter;
