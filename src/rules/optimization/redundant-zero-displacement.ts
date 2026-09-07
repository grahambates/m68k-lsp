import type { Rule } from "../../core/rule.js";
import { operand } from "../../util/ast.js";
import { replaceOperandInLine, sourceOperand } from "./helpers.js";

export const redundantZeroDisplacement: Rule = {
  meta: {
    id: "optimization/redundant-zero-displacement",
    category: "optimization",
    defaultSeverity: "suggestion",
    enabledByDefault: false,
    presets: ["style"],
    description: "Omit a zero address-register displacement",
    tags: ["asp68k", "addressing"],
    docs: {
      source: "ASP68K",
      note: "Off by default: vasm and other optimising assemblers encode 0(a0) and (a0) identically, so the measured saving is in the written form rather than the output. What is left is a preference about how the source reads, and a displacement of zero is sometimes written on purpose to match the non-zero cases around it.",
    },
  },
  checkLine(ctx, line) {
    for (let i = 0; i < (line.operands?.length ?? 0); i++) {
      const op = operand(line, i);
      if (!op || op.type !== "address-register-indirect-displacement") continue;
      if (op.register.type !== "address-register") continue;
      const displacement = ctx.evaluate(op.displacement);
      if (!displacement.known || displacement.value !== 0) continue;

      const original = sourceOperand(ctx, line, i);
      const operandText = `(${op.register.register})`;
      // Replacements are line-scoped, so rewrite the operand within the full line.
      const replacement = replaceOperandInLine(ctx, line, i, operandText);
      if (!replacement) continue;
      ctx.report({
        ruleId: this.meta.id,
        category: this.meta.category,
        severity: this.meta.defaultSeverity,
        confidence: "certain",
        message: `Zero displacement ${original ?? `0(${op.register.register})`} can use ${operandText}`,
        loc: op.loc,
        suggestion: { description: `Use ${operandText}`, replacement, applicability: "safe" },
        notes: [
          {
            message:
              "Both spellings address the same location. An assembler that optimises addressing modes, vasm among them, emits the same encoding for either, so the bytes measured here are those of the written form rather than of the output.",
          },
        ],
        data: { operandIndex: i },
      });
    }
  },
};
