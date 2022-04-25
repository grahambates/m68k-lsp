import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";

import { parseLine } from "../../parse";
import { Formatter } from "../DocumentFormatter";

export type AlignOptions = {
  mnemonic: number;
  operands: number;
  comment: number;
  indentStyle?: "space" | "tab";
  tabSize?: number;
};

// TODO:
// label posiiton?
// auto align?
// alternate assignment for const definition?
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

        edits.push({
          range: {
            start: { character: previousEnd, line },
            end: { character: start, line },
          },
          newText: char.repeat(count),
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

      if (mnemonic) {
        // Extend element to end of size
        const end = size?.end ?? mnemonic.end;
        addIndent(this.options.mnemonic, mnemonic.start, end);
      }

      if (operands) {
        // Extend to all operands
        const end = operands[operands.length - 1].end;
        addIndent(this.options.operands, operands[0].start, end);
      }

      if (comment && comment.start > 0 && this.options.comment) {
        addIndent(this.options.comment, comment.start, comment.end);
      }
    }

    return edits;
  }
}

export default AlignFormatter;
