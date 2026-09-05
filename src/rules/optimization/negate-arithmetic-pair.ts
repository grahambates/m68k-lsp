import type {  } from "m68k-parser";
import type { Rule } from "../../core/rule.js";
import type { RuleContext } from "../../core/context.js";
import { dataRegisterOperand, instructionSize, isInstruction } from "../../util/ast.js";

function hasLabelBetween(ctx: RuleContext, from: number, to: number): boolean {
  for (let i = from + 1; i <= to; i++) if (ctx.line(i)?.label) return true;
  return false;
}

function makeRule(
  id: string,
  secondMnemonic: "add" | "sub",
  replacementMnemonic: "sub" | "add",
): Rule {
  return {
    meta: {
      id,
      category: "optimization",
      defaultSeverity: "suggestion",
      description: `Remove NEG before ${secondMnemonic.toUpperCase()} when the negated source is dead`,
      tags: ["asp68k", "sequence", "register-liveness", "ccr", "size", "speed"],
      docs: { source: "ASP68K" },
    },
    checkLine(ctx, line, index) {
      if (!isInstruction(line, "neg")) return;
      const size = instructionSize(line);
      if (!size) return;
      const negated = dataRegisterOperand(line, 0);
      if (!negated) return;

      const next = ctx.nextInstruction(index);
      if (!next || hasLabelBetween(ctx, index, next.index)) return;
      if (!isInstruction(next.line, secondMnemonic) || instructionSize(next.line) !== size) return;
      const source = dataRegisterOperand(next.line, 0);
      const dest = dataRegisterOperand(next.line, 1);
      if (!source || !dest || source.register.toLowerCase() !== negated.register.toLowerCase()) return;

      // Removing NEG changes the final value left in the source register. ASP68K
      // explicitly requires that register to be disposable ("dx is trashed").
      if (ctx.registers.isLiveAfter(next.index, negated.register) !== "dead") return;

      // ADD x,y and SUB -x,y (or vice versa) agree on the arithmetic result in y,
      // but carry/borrow/overflow details are subtle. Only call this safe when no
      // condition code from the final arithmetic operation is observable.
      const flagStates = (["X", "N", "Z", "V", "C"] as const).map((flag) => ctx.flags.isLiveAfter(next.index, flag));
      const flagsDead = flagStates.every((state) => state === "dead");
      const flagsLive = flagStates.some((state) => state === "live");
      const applicability = flagsDead ? "safe" as const : "conditional" as const;
      const confidence = flagsDead ? "certain" as const : flagsLive ? "high" as const : "medium" as const;

      const r = negated.register;
      const d = dest.register;
      const replacement = `${replacementMnemonic}.${size} ${r},${d}`;
      ctx.report({
        ruleId: id,
        category: "optimization",
        severity: "suggestion",
        confidence,
        message: `NEG.${size.toUpperCase()} ${r.toUpperCase()} followed by ${secondMnemonic.toUpperCase()}.${size.toUpperCase()} can collapse to ${replacementMnemonic.toUpperCase()}`,
        loc: line.mnemonic!.loc,
        suggestion: {
          description: `Replace both instructions with ${replacement.toUpperCase()}`,
          replacement,
          applicability,
        },
        notes: [
          { message: `The source register ${r.toUpperCase()} is proven dead after the pair, satisfying ASP68K's “dx is trashed” caveat.` },
          ...(flagsDead ? [] : [{ message: "The replacement may leave different condition-code details; review later CCR use." }]),
        ],
        data: { sourceEndIndex: next.index },
      });
    },
  };
}

export const negateThenSubToAdd = makeRule(
  "optimization/negate-sub-to-add",
  "sub",
  "add",
);

export const negateThenAddToSub = makeRule(
  "optimization/negate-add-to-sub",
  "add",
  "sub",
);

export const negateAddPowerOfTwoToEor: Rule = {
  meta: {
    id: "optimization/negate-add-power-of-two-to-eor",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Replace NEG followed by ADD of a power of two with an EOR mask when the input is proven in range",
    tags: ["asp68k", "sequence", "constant-propagation", "ccr", "size", "speed"],
    docs: { source: "ASP68K" },
  },
  checkLine(ctx, line, index) {
    if (!isInstruction(line, "neg")) return;
    const size = instructionSize(line);
    if (!size) return;
    const reg = dataRegisterOperand(line, 0);
    if (!reg) return;
    const prior = ctx.registers.knownConstantBefore(index, reg.register);
    if (prior === undefined || prior < 0) return;

    const next = ctx.nextInstruction(index);
    if (!next || hasLabelBetween(ctx, index, next.index)) return;
    if (!isInstruction(next.line, "add") || instructionSize(next.line) !== size) return;
    const imm = next.line.operands?.[0];
    const dest = dataRegisterOperand(next.line, 1);
    if (imm?.type !== "immediate" || imm.value.type === "string-literal" || !dest || dest.register.toLowerCase() !== reg.register.toLowerCase()) return;
    const n = ctx.evaluate(imm.value);
    if (!n.known || n.value <= 0 || (n.value & (n.value - 1)) !== 0 || prior >= n.value) return;

    // The identity n-x == x XOR (n-1) holds for 0 <= x < n when n is a power of two.
    // EOR and NEG+ADD do not have equivalent arithmetic flags, so only mark safe if all
    // condition-code outputs are provably dead.
    const flagStates = (["X", "N", "Z", "V", "C"] as const).map((flag) => ctx.flags.isLiveAfter(next.index, flag));
    const flagsDead = flagStates.every((state) => state === "dead");
    const flagsLive = flagStates.some((state) => state === "live");
    const applicability = flagsDead ? "safe" as const : "conditional" as const;
    const confidence = flagsDead ? "certain" as const : flagsLive ? "high" as const : "medium" as const;
    const mask = n.value - 1;
    const replacement = `eor.${size} #${mask},${reg.register}`;
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence,
      message: `Known ${reg.register.toUpperCase()}=${prior} satisfies the ASP68K power-of-two NEG/ADD identity`,
      loc: line.mnemonic!.loc,
      suggestion: { description: `Replace both instructions with ${replacement.toUpperCase()}`, replacement, applicability },
      notes: [
        { message: `ASP68K requires n to be a power of two and dx<n; both are proven here (${prior}<${n.value}).` },
        ...(flagsDead ? [] : [{ message: "EOR leaves different arithmetic condition codes from NEG+ADD; review later CCR use." }]),
      ],
      data: { sourceEndIndex: next.index },
    });
  },
};
