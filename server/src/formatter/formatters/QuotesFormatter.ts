import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { nodeAsRange } from "../../geometry";
import { Formatter } from "../DocumentFormatter";

export type QuotesOptions = "double" | "single" | "any";

class QuotesFormatter implements Formatter {
  private query: Parser.Query;

  constructor(language: Parser.Language, private options: QuotesOptions) {
    this.query = language.query(`(string_literal) @string`);
  }

  format(tree: Parser.Tree): TextEdit[] {
    const edits: TextEdit[] = [];
    const options = this.options;
    if (options === "any") {
      return edits;
    }

    const captures = this.query.captures(tree.rootNode);

    // TODO: handle escaping, preferred based on quotes in string

    for (const { node } of captures) {
      if (node.text.startsWith('"') && options === "single") {
        edits.push({
          range: nodeAsRange(node),
          newText: "'" + node.text.substring(1, node.text.length - 1) + "'",
        });
      } else if (node.text.startsWith("'") && options === "double") {
        edits.push({
          range: nodeAsRange(node),
          newText: '"' + node.text.substring(1, node.text.length - 1) + '"',
        });
      }
    }

    return edits;
  }
}

export default QuotesFormatter;
