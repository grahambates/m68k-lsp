import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, isInstruction, operand } from "../../util/ast.js";
import { sourceOperand } from "./helpers.js";

function sameAddressRegister(a: unknown, b: unknown): boolean {
  return !!a && !!b &&
    typeof a === "object" && typeof b === "object" &&
    (a as { type?: string }).type === "address-register" &&
    (b as { type?: string }).type === "address-register" &&
    typeof (a as { register?: unknown }).register === "string" &&
    typeof (b as { register?: unknown }).register === "string" &&
    (a as { register: string }).register.toLowerCase() === (b as { register: string }).register.toLowerCase();
}

export const preferLeaQuick: Rule = {
  meta: {
    id: "optimization/prefer-lea-quick",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Use ADDQ/SUBQ for small same-register LEA displacements",
    tags: ["asp68k", "address-register", "size", "speed"],
    docs: { source: "ASP68K" },
  },

  checkLine(ctx, line) {
    if (!isInstruction(line, "lea")) return;
    const source = operand(line, 0);
    const dest = addressRegisterOperand(line, 1);
    if (!source || source.type !== "address-register-indirect-displacement" || !dest) return;
    if (!sameAddressRegister(source.register, dest)) return;

    const displacement = ctx.evaluate(source.displacement);
    if (!displacement.known || displacement.value === 0 || displacement.value < -8 || displacement.value > 8) return;

    const register = sourceOperand(ctx, line, 1) ?? dest.register;
    const positive = displacement.value > 0;
    const mnemonic = positive ? "addq" : "subq";
    const value = Math.abs(displacement.value);

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `LEA displacement ${displacement.value} can use ${mnemonic.toUpperCase()}.W`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Use ${mnemonic.toUpperCase()}.W`,
        replacement: `${mnemonic}.w #${value},${register}`,
        applicability: "safe",
      },
      notes: [{ message: "ASP68K gives ADDQ.W for +1..+8 and SUBQ.W for -1..-8 when LEA updates the same address register." }],
    });
  },
};
