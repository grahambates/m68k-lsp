import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { Formatter } from "../DocumentFormatter";

const chars = {
  lf: "\n",
  cr: "\r",
  crlf: "\r\n",
};

export type EOL = "lf" | "cr" | "crlf";

class EndOfLineFormatter implements Formatter {
  constructor(private type: EOL, private finalNewLine?: boolean) {}

  format(tree: Parser.Tree): TextEdit[] {
    const edits: TextEdit[] = [];
    const newText = chars[this.type];
    const matches = [...tree.rootNode.text.matchAll(/\r\n?|\n/g)];
    const lines = tree.rootNode.text.split(/\r\n?|\n/);

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const line = lines[i];
      if (match.index && match[0] !== newText) {
        edits.push({
          range: {
            start: { line: i, character: line.length },
            end: { line: i + 1, character: 0 },
          },
          newText,
        });
      }
    }

    if (this.finalNewLine !== undefined) {
      const lastLine = lines[lines.length - 1];
      const hasFinalNewLine = lastLine.length === 0;

      if (this.finalNewLine === true && !hasFinalNewLine) {
        // Add new line
        edits.push({
          range: {
            start: { line: lines.length - 1, character: lastLine.length },
            end: { line: lines.length, character: 0 },
          },
          newText,
        });
      }
      if (this.finalNewLine === false && hasFinalNewLine) {
        const line = lines.length - 2;
        // Prevent overlapping edit if just converted
        if (edits[edits.length - 1].range.start.line === line) {
          edits.pop();
        }
        // Remove new line
        edits.push({
          range: {
            start: {
              line,
              character: lines[line].length,
            },
            end: { line: line + 1, character: 0 },
          },
          newText: "",
        });
      }
    }

    return edits;
  }
}

export default EndOfLineFormatter;
