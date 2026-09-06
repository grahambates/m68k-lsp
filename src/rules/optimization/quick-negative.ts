import type { Rule } from "../../core/rule.js";
import { immediateOperand, instructionSize, isAddqDestination, isInstructionFamily, operand } from "../../util/ast.js";
import { sourceOperand } from "./helpers.js";

function quickNegative(id: string, from: "add" | "sub", to: "subq" | "addq"): Rule {
  return {
    meta: {
      id,
      category: "optimization",
      defaultSeverity: "suggestion",
      description: `Use ${to.toUpperCase()} for negative ${from.toUpperCase()} immediates`,
      tags: ["asp68k", "size", "speed"],
      docs: { source: "ASP68K" },
    },
    checkLine(ctx, line) {
      if (!isInstructionFamily(line, from)) return;
      const imm = immediateOperand(line, 0);
      const dest = operand(line, 1);
      const size = instructionSize(line);
      if (!imm || imm.value.type === "string-literal" || !isAddqDestination(dest, size)) return;
      const value = ctx.evaluate(imm.value);
      if (!value.known || value.value < -8 || value.value > -1) return;
      const suffix = size ? `.${size}` : "";
      const d = sourceOperand(ctx, line, 1);
      const magnitude = -value.value;
      ctx.report({
        ruleId: id,
        category: "optimization",
        severity: "suggestion",
        confidence: "certain",
        message: `${from.toUpperCase()} by ${value.value} can use ${to.toUpperCase()} #${magnitude}`,
        loc: line.mnemonic!.loc,
        suggestion: {
          description: `Use ${to.toUpperCase()}`,
          replacement: d ? `${to}${suffix} #${magnitude},${d}` : undefined,
          applicability: "safe",
        },
        notes: [{ message: "Negating the immediate moves it into the quick form's 1 to 8 range." }],
      });
    },
  };
}
export const preferSubqForNegativeAdd = quickNegative("optimization/prefer-subq-negative-add", "add", "subq");
export const preferAddqForNegativeSub = quickNegative("optimization/prefer-addq-negative-sub", "sub", "addq");
