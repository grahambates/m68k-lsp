import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, immediateOperand, instructionSize, isInstruction } from "../../util/ast.js";
import { sourceOperand } from "./helpers.js";

function earlyTargetsOnly(ctx: Parameters<NonNullable<Rule["checkLine"]>>[0]): boolean {
  return ctx.config.processors.every((cpu) => cpu === "mc68000" || cpu === "mc68010");
}

function stripImmediate(text: string): string {
  return text.trim().replace(/^#\s*/, "");
}

export const moveImmediateAddressToLea: Rule = {
  meta: {
    id: "optimization/movea-immediate-to-lea",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Use LEA for a non-zero immediate address-register load on early targets",
    tags: ["asp68k", "address-register", "68000", "68010"],
    docs: { source: "ASP68K" },
  },
  checkLine(ctx, line) {
    if (!isInstruction(line, "movea") || !earlyTargetsOnly(ctx)) return;
    const size = instructionSize(line);
    if (size !== "w" && size !== "l") return;
    const imm = immediateOperand(line, 0);
    const dest = addressRegisterOperand(line, 1);
    if (!imm || !dest || imm.value.type === "string-literal") return;
    const value = ctx.evaluate(imm.value);
    if (!value.known || value.value === 0) return;
    const text = sourceOperand(ctx, line, 0);
    if (!text) return;

    const replacement = `lea ${stripImmediate(text)}.${size},${dest.register}`;
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `This MOVEA.${size} immediate can be expressed as an absolute LEA on 68000/68010`,
      loc: line.mnemonic!.loc,
      suggestion: { description: "Use LEA", replacement, applicability: "safe" },
      notes: [
        {
          message:
            "Both forms load the same address-register value and preserve CCR; ASP68K records a speed win on 68000/68010 with no size change.",
        },
      ],
    });
  },
};

export const moveAddressThenAddToLea: Rule = {
  meta: {
    id: "optimization/movea-add-to-lea",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Combine MOVEA plus immediate ADDA into one LEA",
    tags: ["asp68k", "address-register", "sequence", "size", "speed"],
    docs: { source: "ASP68K" },
  },
  checkLine(ctx, line, index) {
    // Restrict the copy to .L. MOVEA.W sign-extends the low source word, while
    // LEA uses the complete base register and is therefore not generally equivalent.
    if (!isInstruction(line, "movea") || instructionSize(line) !== "l") return;
    const source = addressRegisterOperand(line, 0);
    const dest = addressRegisterOperand(line, 1);
    if (!source || !dest) return;

    const next = ctx.nextInstruction(index);
    if (!next || next.line.label || !isInstruction(next.line, "adda")) return;
    const addSize = instructionSize(next.line);
    if (addSize !== "w" && addSize !== "l") return;
    const imm = immediateOperand(next.line, 0);
    const addDest = addressRegisterOperand(next.line, 1);
    if (
      !imm ||
      !addDest ||
      addDest.register.toLowerCase() !== dest.register.toLowerCase() ||
      imm.value.type === "string-literal"
    )
      return;
    const value = ctx.evaluate(imm.value);
    if (!value.known || value.value < -32768 || value.value > 32767) return;

    const replacement = `lea ${value.value}(${source.register}),${dest.register}`;
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: "MOVEA plus immediate ADDA can be folded into one LEA",
      loc: line.mnemonic!.loc,
      suggestion: { description: "Fold the address copy and adjustment into LEA", replacement, applicability: "safe" },
      notes: [
        {
          message:
            "The .L source copy preserves the full base address, and the displacement is within the signed 16-bit LEA range.",
        },
        { message: "ASP68K records a 2/4-byte saving for this sequence across its listed CPUs." },
      ],
      data: { secondInstructionIndex: next.index },
    });
  },
};
