import type { Rule } from "../../core/rule.js";
import { isInstruction } from "../../util/ast.js";
import { sourceOperand } from "./helpers.js";

function makeTailCallRule(id: string, from: "jsr" | "bsr", to: "jmp" | "bra"): Rule {
  return {
    meta: {
      id,
      category: "optimization",
      defaultSeverity: "suggestion",
      description: `Replace ${from.toUpperCase()} followed by RTS with ${to.toUpperCase()}`,
      tags: ["asp68k", "control-flow", "tail-call", "size", "speed"],
      docs: { source: "ASP68K" },
    },

    checkLine(ctx, line, index) {
      if (!isInstruction(line, from)) return;
      const next = ctx.nextInstruction(index);
      if (!next || !isInstruction(next.line, "rts")) return;

      // If a label sits on the RTS line, other code may branch to it. The
      // optimization can still be considered, but definitely requires manual review.
      const target = sourceOperand(ctx, line, 0);
      if (!target) return;

      ctx.report({
        ruleId: id,
        category: "optimization",
        severity: "suggestion",
        confidence: "high",
        message: `${from.toUpperCase()} followed by RTS is a tail-call candidate`,
        loc: line.mnemonic!.loc,
        suggestion: {
          description: `Replace the pair with ${to.toUpperCase()} ${target}`,
          applicability: "manual",
        },
        notes: [
          {
            message: `${from.toUpperCase()} + RTS can become ${to.toUpperCase()}, but the stack depth in the callee differs.`,
          },
          ...(next.line.label
            ? [{ message: "The RTS line has a label; preserve any externally reachable label when rewriting." }]
            : []),
        ],
        data: { secondInstructionIndex: next.index },
      });
    },
  };
}

export const jsrRtsTailCall = makeTailCallRule("optimization/jsr-rts-tail-call", "jsr", "jmp");
export const bsrRtsTailCall = makeTailCallRule("optimization/bsr-rts-tail-call", "bsr", "bra");
