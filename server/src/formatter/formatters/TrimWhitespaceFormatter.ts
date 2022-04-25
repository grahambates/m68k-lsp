import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { Formatter } from "../DocumentFormatter";

class TrimWhitespaceFormatter implements Formatter {
  format(tree: Parser.Tree): TextEdit[] {
    const edits: TextEdit[] = [];

    const lines = tree.rootNode.text.split(/\r\n?|\n/);

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/\s+$/);
      if (match && match.index) {
        const start = match.index;
        const end = match.index + match[0].length;

        edits.push({
          range: {
            start: { line: i, character: start },
            end: { line: i, character: end },
          },
          newText: "",
        });
      }
    }

    return edits;
  }
}

export default TrimWhitespaceFormatter;
