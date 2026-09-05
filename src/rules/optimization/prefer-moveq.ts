import type { Rule } from "../../core/rule.js";
import { dataRegisterOperand, immediateOperand, instructionSize, isInstruction } from "../../util/ast.js";

export const preferMoveq: Rule = {
  meta: {
    id: "optimization/prefer-moveq",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Prefer MOVEQ for long immediates in the signed 8-bit range",
    tags: ["asp68k", "size", "68000"],
    docs: { source: "ASP68K" },
  },

  checkLine(ctx, line) {
    if (!isInstruction(line, "move")) return;
    if (instructionSize(line) !== "l") return;

    const source = immediateOperand(line, 0);
    const dest = dataRegisterOperand(line, 1);
    if (!source || !dest) return;
    if (source.value.type === "string-literal") return;

    const value = ctx.evaluate(source.value);
    if (!value.known || value.value < -128 || value.value > 127) return;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `Immediate ${value.value} fits the MOVEQ signed 8-bit range`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Use moveq #${value.value},${dest.register}`,
        replacement: `moveq #${value.value},${dest.register}`,
        applicability: "safe",
      },
      notes: [{ message: "ASP68K records a 4-byte size saving for this form." }],
    });
  },
};
