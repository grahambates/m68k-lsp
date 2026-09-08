import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { Formatter } from "../DocumentFormatter";
import { nodeAsRange } from "../../geometry";

export type OperandSpaceOptions = "on" | "off" | "any";

class OperandSpaceFormatter implements Formatter {
  private query: Parser.Query;

  constructor(language: Parser.Language, private options: OperandSpaceOptions) {
    this.query = language.query(`(operand_list) @operand_list`);
  }

  format(tree: Parser.Tree): TextEdit[] {
    if (this.options === "any") return []; // No changes

    const edits: TextEdit[] = [];
    const useSpace = this.options === "on";
    const operandLists = this.query.captures(tree.rootNode);

    for (const {
      node: { namedChildren: operands },
    } of operandLists) {
      // Iterate over operands in list, excluding last:
      for (let i = 0; i < operands.length - 1; i++) {
        const currentOperand = operands[i];
        const nextOperand = currentOperand.nextNamedSibling;

        if (nextOperand) {
          const sep = tree.rootNode.text.substring(
            currentOperand.endIndex,
            nextOperand.startIndex
          );

          const expected = useSpace ? ", " : ",";

          // Apply changes if needed:
          if (sep !== expected) {
            edits.push({
              range: {
                start: nodeAsRange(operands[i]).end,
                end: nodeAsRange(nextOperand).start,
              },
              newText: expected,
            });
          }
        }
      }
    }

    return edits;
  }
}

export default OperandSpaceFormatter;
