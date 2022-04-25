import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { nodeAsRange } from "../../geometry";
import { isLocalLabel } from "../../symbols";
import { Formatter } from "../DocumentFormatter";

type UseColon = "on" | "off" | "notInline" | "onlyInline" | "any";

export type LabelColonOptions =
  | UseColon
  | {
      global?: UseColon;
      local?: UseColon;
    };

class LabelColonFormatter implements Formatter {
  private query: Parser.Query;

  constructor(language: Parser.Language, private options: LabelColonOptions) {
    this.query = language.query(`(label) @label`);
  }

  format(tree: Parser.Tree): TextEdit[] {
    const edits: TextEdit[] = [];
    const options = this.options;

    const captures = this.query.captures(tree.rootNode);

    for (const { node } of captures) {
      const scope = isLocalLabel(node.text) ? "local" : "global";

      const option = typeof options === "string" ? options : options[scope];
      if (!option || option === "any") {
        continue;
      }

      // Detect inline - any named nodes on same line, other than comments?
      const next = node.nextNamedSibling;
      const isInline =
        next?.startPosition.row === node.startPosition.row &&
        next.type !== "comment";

      const hasColon = node.nextSibling?.text === ":";
      if (
        (option === "on" ||
          (isInline && option === "onlyInline") ||
          (!isInline && option === "notInline")) &&
        !hasColon
      ) {
        // Add colon:
        const { end } = nodeAsRange(node);
        edits.push({
          range: { start: end, end },
          newText: ":",
        });
      }
      if (
        (option === "off" ||
          (isInline && option === "notInline") ||
          (!isInline && option === "onlyInline")) &&
        hasColon &&
        // Can't remove if label is not at position 0
        node.startPosition.column === 0
      ) {
        // Remove colon:
        edits.push({
          range: nodeAsRange(node.nextSibling as Parser.SyntaxNode),
          newText: "",
        });
      }
    }

    return edits;
  }
}

export default LabelColonFormatter;
