import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, immediateOperand, instructionSize, isInstruction } from "../../util/ast.js";

export const preferMoveWordAddress: Rule = {
  meta: {
    id: "optimization/prefer-move-word-address",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Use a word immediate when loading a signed 16-bit address-register constant",
    tags: ["asp68k", "size"],
    docs: { source: "ASP68K" },
  },
  checkLine(ctx, line) {
    if (!isInstruction(line, "movea") || instructionSize(line) !== "l") return;
    const imm = immediateOperand(line, 0);
    const dest = addressRegisterOperand(line, 1);
    if (!imm || imm.value.type === "string-literal" || !dest) return;
    const value = ctx.evaluate(imm.value);
    if (!value.known || value.value === 0 || value.value < -32767 || value.value > 32767) return;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: "This address-register immediate fits the sign-extended word form",
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Use MOVE.W #${value.value},${dest.register}`,
        replacement: `movea.w #${value.value},${dest.register}`,
        applicability: "safe",
      },
      notes: [{ message: "ASP68K lists MOVE.L #n,An → MOVE.W #n,An for -32767..32767, saving 2 bytes." }],
    });
  },
};
