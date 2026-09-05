import type { Rule } from "../../core/rule.js";
import { DATA_REGISTERS } from "../../semantics/registers.js";
import { addressRegisterOperand, immediateOperand, instructionSize, isInstructionFamily } from "../../util/ast.js";

export const cmpZeroAddressViaScratch: Rule = {
  meta: {
    id: "optimization/cmp-zero-address-via-scratch",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Compare an address register with zero via a dead data register on early CPUs",
    tags: ["asp68k", "register-analysis", "scratch-register", "cmp", "address-register"],
    docs: { source: "ASP68K" },
  },
  checkLine(ctx, line, index) {
    if (!isInstructionFamily(line, "cmp")) return;
    if (instructionSize(line) !== "l") return;
    const source = immediateOperand(line, 0);
    const dest = addressRegisterOperand(line, 1);
    if (!source || source.value.type === "string-literal" || !dest) return;
    const value = ctx.evaluate(source.value);
    if (!value.known || value.value !== 0) return;
    if (!ctx.config.processors.every((cpu) => ["mc68000", "mc68010", "mc68030"].includes(cpu))) return;

    const scratch = DATA_REGISTERS.find((r) => ctx.registers.isLiveAfter(index, r) === "dead");
    if (!scratch) return;
    const replacement = `move.l ${dest.register},${scratch}`;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `${scratch.toUpperCase()} is dead here and can receive ${dest.register.toUpperCase()} to set zero/sign flags`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Use ${replacement.toUpperCase()}`,
        replacement,
        applicability: "safe",
      },
      notes: [
        {
          message:
            "For the .L form, MOVE sets N/Z from the full address-register value and clears V/C, matching comparison with zero; X is preserved by both.",
        },
        {
          message: "ASP68K lists moving the address register to a scratch data register as an early-CPU optimisation.",
        },
        {
          message:
            "The .W form is deliberately not suggested because its flag semantics are not equivalent to CMPA.W #0,An.",
        },
      ],
    });
  },
};
