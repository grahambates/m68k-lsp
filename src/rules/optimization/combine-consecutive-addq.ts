import type { ParsedLine } from "m68k-parser";
import type { Rule } from "../../core/rule.js";
import { immediateOperand, instructionSize, isInstruction, operand } from "../../util/ast.js";
import { changedFlagsApplicability, hasLabelBetween, sourceOperand } from "./helpers.js";

function directRegisterName(line: ParsedLine): string | undefined {
  const op = operand(line, 1);
  return op?.type === "data-register" || op?.type === "address-register" ? op.register.toLowerCase() : undefined;
}

export const combineConsecutiveAddq: Rule = {
  meta: {
    id: "optimization/combine-consecutive-addq",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Combine consecutive ADDQ.L operations on the same register",
    tags: ["asp68k", "sequence", "addq", "speed", "ccr"],
    docs: { source: "ASP68K" },
  },
  checkLine(ctx, line, index) {
    if (!isInstruction(line, "addq") || instructionSize(line) !== "l") return;
    const firstReg = directRegisterName(line);
    const firstImm = immediateOperand(line, 0);
    if (!firstReg || !firstImm || firstImm.value.type === "string-literal") return;
    const n = ctx.evaluate(firstImm.value);
    if (!n.known || n.value < 1 || n.value > 8) return;

    const next = ctx.nextInstruction(index);
    if (!next || hasLabelBetween(ctx, index, next.index)) return;
    if (!isInstruction(next.line, "addq") || instructionSize(next.line) !== "l") return;
    if (directRegisterName(next.line) !== firstReg) return;
    const secondImm = immediateOperand(next.line, 0);
    if (!secondImm || secondImm.value.type === "string-literal") return;
    const m = ctx.evaluate(secondImm.value);
    if (!m.known || m.value < 1 || m.value > 8) return;
    if (!ctx.config.processors.every((cpu) => ["mc68000", "mc68010", "mc68030"].includes(cpu))) return;

    const destText = sourceOperand(ctx, line, 1);
    if (!destText) return;
    const total = n.value + m.value;
    // The ASP68K table claims the full-immediate form (sum > 8) is a
    // speed win on 68000/68010/68030. Exact 68000 auditing with 68kcounter
    // shows no CPU-cycle gain and a 2-byte / 1-read-cycle regression, so do
    // not offer that branch when mc68000 is one of the selected targets.
    // Keep the 68010/68030 cases source-backed until we have exact counters.
    if (total > 8 && ctx.config.processors.includes("mc68000")) return;

    const isAddress = operand(line, 1)?.type === "address-register";
    const safety = isAddress
      ? { applicability: "safe" as const, confidence: "certain" as const }
      : changedFlagsApplicability(ctx, next.index, ["X", "V", "C"]);
    const replacement = total <= 8 ? `addq.l #${total},${destText}` : `add.l #${total},${destText}`;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: safety.confidence,
      message: `Two ADDQ.L operations on ${firstReg.toUpperCase()} can be combined into one immediate add`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Replace both instructions with ${replacement.toUpperCase()}`,
        replacement,
        applicability: safety.applicability,
      },
      notes: [
        {
          message:
            total <= 8
              ? "The combined value still fits ADDQ, so one ADDQ is preferable to a full immediate ADD."
              : "On 68000 this form was measured as no faster and 2 bytes larger, so it is suppressed there; it remains available for 68010 and 68030.",
        },
        ...(isAddress || safety.applicability === "safe"
          ? []
          : [
              {
                message:
                  "For data registers, the final N/Z result is the same but X/V/C can differ from the second ADDQ; review flag use.",
              },
            ]),
      ],
      data: { sourceEndIndex: next.index },
    });
  },
};
