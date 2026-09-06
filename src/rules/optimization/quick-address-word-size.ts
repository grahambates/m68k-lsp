import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, immediateOperand, instructionSize, isInstruction } from "../../util/ast.js";

function makeRule(mnemonic: "addq" | "subq"): Rule {
  return {
    meta: {
      id: `optimization/${mnemonic}-address-word-size`,
      category: "optimization",
      defaultSeverity: "suggestion",
      description: `Prefer ${mnemonic.toUpperCase()}.W over .L for address-register destinations on early CPUs`,
      tags: ["asp68k", "speed", "68000", "68010"],
      docs: { source: "ASP68K" },
    },
    checkLine(ctx, line) {
      if (!isInstruction(line, mnemonic) || instructionSize(line) !== "l") return;
      const imm = immediateOperand(line, 0);
      const dest = addressRegisterOperand(line, 1);
      if (!imm || !dest) return;
      if (!ctx.config.processors.every((cpu) => cpu === "mc68000" || cpu === "mc68010")) return;
      const rendered = imm.value.type === "numeric-literal" ? imm.value.raw : undefined;
      const immediate = rendered ?? "n";
      ctx.report({
        ruleId: this.meta.id,
        category: this.meta.category,
        severity: this.meta.defaultSeverity,
        confidence: "certain",
        message: `${mnemonic.toUpperCase()}.L to an address register can use the word-size form on this target`,
        loc: line.mnemonic!.loc,
        suggestion: {
          description: `Use ${mnemonic.toUpperCase()}.W #${immediate},${dest.register}`,
          replacement: rendered ? `${mnemonic}.w #${rendered},${dest.register}` : undefined,
          applicability: "safe",
        },
        notes: [
          {
            message: `The word form reaches the same address register value, since ${mnemonic.toUpperCase()} on an address register always updates all 32 bits.`,
          },
        ],
      });
    },
  };
}

export const addqAddressWordSize = makeRule("addq");
export const subqAddressWordSize = makeRule("subq");
