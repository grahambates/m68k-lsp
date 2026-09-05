import type { Rule } from "../../core/rule.js";
import { isInstruction } from "../../util/ast.js";

export const suspiciousNop: Rule = {
  meta: {
    id: "suspicious/nop",
    category: "suspicious",
    defaultSeverity: "info",
    enabledByDefault: false,
    description: "Flag NOP instructions for review",
    tags: ["timing", "padding", "likely-intentional"],
  },

  checkLine(ctx, line) {
    if (!isInstruction(line, "nop")) return;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "low",
      message: "NOP may be intentional for timing, patching, alignment, or debugging",
      loc: line.mnemonic!.loc,
      suggestion: {
        description: "Review whether the NOP is still required",
        applicability: "manual",
      },
    });
  },
};
