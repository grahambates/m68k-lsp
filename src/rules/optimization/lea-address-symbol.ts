import type { ExpressionNode } from "m68k-parser";
import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, immediateOperand, instructionSize, isInstruction } from "../../util/ast.js";
import { sourceOperand } from "./helpers.js";

/**
 * Whether the expression names something the assembler resolves rather than a
 * value we can fold. A relocatable label is exactly the case where LEA lets the
 * assembler pick a smaller effective address.
 */
function referencesSymbol(expr: ExpressionNode): boolean {
  switch (expr.type) {
    case "symbol":
    case "current-address":
      return true;
    case "group":
      return referencesSymbol(expr.expression);
    case "unary-op":
      return referencesSymbol(expr.operand);
    case "binary-op":
      return referencesSymbol(expr.left) || referencesSymbol(expr.right);
    default:
      return false;
  }
}

function stripImmediate(text: string): string {
  return text.trim().replace(/^#\s*/, "");
}

export const preferLeaForAddressSymbol: Rule = {
  meta: {
    id: "optimization/prefer-lea-for-address-symbol",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Use LEA rather than a long immediate MOVEA when loading a symbolic address",
    tags: ["address-register", "addressing", "assembler-relaxation", "clarity"],
    docs: {
      note: "Enables assembler relaxation to PC-relative; 68kcounter measures source and cannot model that.",
    },
  },
  checkLine(ctx, line) {
    if (!isInstruction(line, "movea")) return;
    // Restricted to .L. MOVEA.W sign-extends its source, and forcing an
    // absolute-short LEA to match would rule out the PC-relative form that is
    // the whole point of this rule.
    if (instructionSize(line) !== "l") return;

    const imm = immediateOperand(line, 0);
    const dest = addressRegisterOperand(line, 1);
    if (!imm || !dest || imm.value.type === "string-literal") return;

    // A foldable constant is a value, not an address. Those belong to
    // optimization/movea-immediate-to-lea, which is gated to 68000/68010 on
    // ASP68K's cycle claim; leaving them alone keeps the two rules disjoint.
    if (ctx.evaluate(imm.value).known) return;
    if (!referencesSymbol(imm.value)) return;

    const text = sourceOperand(ctx, line, 0);
    if (!text) return;

    // Deliberately no size suffix: an explicit .L would pin the operand to
    // absolute long and defeat the relaxation this rule exists to enable.
    const replacement = `lea ${stripImmediate(text)},${dest.register}`;
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `Loading the address of ${stripImmediate(text)} is clearer as LEA`,
      loc: line.mnemonic!.loc,
      suggestion: { description: `Use ${replacement}`, replacement, applicability: "safe" },
      notes: [
        {
          message:
            "Both forms load the same address and neither affects CCR. As written they are the same size and speed, so no measured delta is expected.",
        },
        {
          message:
            "The gain is at assembly time: LEA lets the assembler relax the operand to PC-relative where the target is in range, which is 2 bytes shorter and faster. A long immediate MOVEA can never be relaxed.",
        },
      ],
      data: { symbol: stripImmediate(text) },
    });
  },
};
