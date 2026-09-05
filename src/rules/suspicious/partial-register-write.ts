import type { Rule } from "../../core/rule.js";
import { semanticMnemonic } from "../../semantics/mnemonics.js";
import { dataRegisterOperand, instructionSize } from "../../util/ast.js";

export const partialRegisterWrite: Rule = {
  meta: {
    id: "suspicious/partial-register-write",
    category: "suspicious",
    defaultSeverity: "warning",
    description: "Flag byte/word MOVE writes whose preserved upper bits are subsequently used",
    tags: ["data-registers", "partial-width", "dataflow"],
  },

  checkLine(ctx, line, index) {
    if (semanticMnemonic(line) !== "move") return;
    const size = instructionSize(line);
    if (size !== "b" && size !== "w") return;
    const destination = dataRegisterOperand(line, 1);
    if (!destination) return;

    const upperMask = size === "b" ? 0xffffff00 : 0xffff0000;
    const use = ctx.registers.dataRegisterBitsUseAfter(index, destination.register, upperMask);
    if (use !== "used") return;

    const preserved = size === "b" ? "upper 24 bits" : "upper 16 bits";
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "medium",
      message: `MOVE.${size.toUpperCase()} preserves the ${preserved} of ${destination.register.toUpperCase()}, and later code reads them`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: "Review whether the preserved upper bits are intentional; clear/extend or use a full-width write if not",
        applicability: "manual",
      },
    });
  },
};
