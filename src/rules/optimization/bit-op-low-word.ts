import type { Rule } from "../../core/rule.js";
import { dataRegisterOperand, immediateOperand, instructionSize, isInstruction } from "../../util/ast.js";
import { changedFlagsApplicability } from "./helpers.js";

function makeRule(kind: "bset" | "bclr"): Rule {
  return {
    meta: {
      id: `optimization/${kind}-low-word-mask`,
      category: "optimization",
      defaultSeverity: "suggestion",
      description: `Use a word mask for low-bit ${kind.toUpperCase()}`,
      tags: ["asp68k", "bit", "ccr"],
      docs: { source: "ASP68K" },
    },
    checkLine(ctx, line, index) {
      if (!isInstruction(line, kind)) return;
      const size = instructionSize(line);
      if (size && size !== "l") return;
      const bitOp = immediateOperand(line, 0);
      const dest = dataRegisterOperand(line, 1);
      if (!bitOp || bitOp.value.type === "string-literal" || !dest) return;
      const bit = ctx.evaluate(bitOp.value);
      if (!bit.known || bit.value < 0 || bit.value > 15) return;
      if (!ctx.config.processors.every((cpu) => ["mc68000", "mc68010", "mc68030", "mc68040"].includes(cpu))) return;

      const mask = kind === "bset" ? (1 << bit.value) : (0xffff ^ (1 << bit.value));
      const op = kind === "bset" ? "or" : "and";
      const renderedMask = `$${(mask & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`;
      const safety = changedFlagsApplicability(ctx, index, ["N", "Z", "V", "C"]);

      ctx.report({
        ruleId: this.meta.id,
        category: this.meta.category,
        severity: this.meta.defaultSeverity,
        confidence: safety.confidence,
        message: `${kind.toUpperCase()} #${bit.value},${dest.register} can use ${op.toUpperCase()}.W with a constant mask`,
        loc: line.mnemonic!.loc,
        suggestion: {
          description: `Use ${op.toUpperCase()}.W #${renderedMask},${dest.register}`,
          replacement: `${op}.w #${renderedMask},${dest.register}`,
          applicability: safety.applicability,
        },
        notes: [
          { message: `ASP68K lists ${kind.toUpperCase()}.L #n,Dn → ${op.toUpperCase()}.W #mask,Dn for bit numbers 0..15.` },
          ...(safety.applicability === "safe" ? [] : [{ message: "The mask operation and bit operation leave different condition-code results; review CCR use." }]),
        ],
      });
    },
  };
}

export const bsetLowWordMask = makeRule("bset");
export const bclrLowWordMask = makeRule("bclr");
