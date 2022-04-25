import { TextEdit } from "vscode-languageserver";
import Parser from "web-tree-sitter";
import { nodeAsRange } from "../../geometry";
import { Formatter } from "../DocumentFormatter";

export type CaseOptions = Case | Partial<Record<CaseType, Case>>;
type Case = "upper" | "lower" | "any";
type CaseType =
  | "instruction"
  | "directive"
  | "control"
  | "register"
  | "sectionType";

class CaseFormatter implements Formatter {
  private query: Parser.Query;

  constructor(language: Parser.Language, private options: CaseOptions) {
    this.query = language.query(`
        (instruction_mnemonic) @instruction
        (directive_mnemonic) @directive
        (control_mnemonic) @control
        (address_register) @register
        (data_register) @register
        (named_register) @register
        (float_register) @register
        (section_type) @sectionType
      `);
  }

  format(tree: Parser.Tree): TextEdit[] {
    const edits: TextEdit[] = [];
    const options = this.options;

    const captures = this.query.captures(tree.rootNode);

    const defaultCase = typeof options === "string" ? options : "any";

    const typeCases: Record<CaseType, Case> = {
      instruction: defaultCase,
      directive: defaultCase,
      control: defaultCase,
      register: defaultCase,
      sectionType: defaultCase,
    };

    if (typeof options !== "string") {
      for (const type in typeCases) {
        const caseValue = options[type as CaseType];
        if (caseValue) {
          typeCases[type as CaseType] = caseValue;
        }
      }
    }

    for (const { node, name } of captures) {
      const typeCase = typeCases[name as CaseType];
      if (typeCase === "any") {
        continue;
      }

      const newText =
        typeCase === "lower"
          ? node.text.toLowerCase()
          : node.text.toUpperCase();
      if (node.text !== newText) {
        edits.push({ range: nodeAsRange(node), newText });
      }

      // If next sibling is a size qualifier change the case of that too
      const nextNode = node.nextNamedSibling;
      if (nextNode && nextNode.type === "size") {
        const newText =
          typeCase === "lower"
            ? nextNode.text.toLowerCase()
            : nextNode.text.toUpperCase();
        if (nextNode.text !== newText) {
          edits.push({ range: nodeAsRange(nextNode), newText });
        }
      }
    }

    return edits;
  }
}

export default CaseFormatter;
