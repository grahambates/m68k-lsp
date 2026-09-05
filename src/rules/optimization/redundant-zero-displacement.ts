import type { Rule } from "../../core/rule.js";
import { operand } from "../../util/ast.js";
import { sourceOperand } from "./helpers.js";

export const redundantZeroDisplacement: Rule = {
  meta: {
    id: "optimization/redundant-zero-displacement",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Omit a zero address-register displacement",
    tags: ["asp68k", "addressing", "size"],
    docs: { source: "ASP68K" },
  },
  checkLine(ctx, line) {
    for (let i = 0; i < (line.operands?.length ?? 0); i++) {
      const op = operand(line, i);
      if (!op || op.type !== "address-register-indirect-displacement") continue;
      if (op.register.type !== "address-register") continue;
      const displacement = ctx.evaluate(op.displacement);
      if (!displacement.known || displacement.value !== 0) continue;

      const original = sourceOperand(ctx, line, i);
      const replacement = `(${op.register.register})`;
      ctx.report({
        ruleId: this.meta.id,
        category: this.meta.category,
        severity: this.meta.defaultSeverity,
        confidence: "certain",
        message: `Zero displacement ${original ?? `0(${op.register.register})`} can use ${replacement}`,
        loc: op.loc,
        suggestion: { description: `Use ${replacement}`, replacement, applicability: "safe" },
        notes: [{ message: "ASP68K lists 0(An) → (An) as a 2-byte saving." }],
        data: { operandIndex: i },
      });
    }
  },
};
