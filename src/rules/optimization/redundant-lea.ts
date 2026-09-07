import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, isInstruction, operand } from "../../util/ast.js";

export const redundantLea: Rule = {
  meta: {
    id: "optimization/redundant-lea",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Remove LEA (An),An when source and destination are identical",
    tags: ["asp68k", "redundant"],
    docs: { source: "ASP68K" },
  },

  checkLine(ctx, line) {
    if (!isInstruction(line, "lea")) return;

    const source = operand(line, 0);
    const dest = addressRegisterOperand(line, 1);
    if (source?.type !== "address-register-indirect" || !dest) return;
    if (source.register.type !== "address-register") return;
    if (source.register.register !== dest.register) return;

    const canDeleteWholeLine = !line.label && !line.comment;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `LEA (${dest.register}),${dest.register} leaves ${dest.register.toUpperCase()} unchanged`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: canDeleteWholeLine
          ? "Remove the redundant instruction"
          : "Remove the instruction while preserving the label/comment",
        replacement: canDeleteWholeLine ? "" : undefined,
        applicability: canDeleteWholeLine ? "safe" : "manual",
      },
    });
  },
};
