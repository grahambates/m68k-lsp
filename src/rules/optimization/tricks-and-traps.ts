import type { Rule } from "../../core/rule.js";
import { dataRegisterOperand, immediateExpressionOperand, instructionSize, isInstruction } from "../../util/ast.js";
import { normalizeRegister } from "../../semantics/registers.js";
import { canonicalMnemonic } from "../../semantics/mnemonics.js";
import { sourceOperand } from "./helpers.js";

function hasLabelBetween(ctx: Parameters<NonNullable<Rule["checkLine"]>>[0], from: number, to: number): boolean {
  for (let i = from + 1; i <= to; i++) if (ctx.line(i)?.label) return true;
  return false;
}

function isConditionalBranch(line: Parameters<NonNullable<Rule["checkLine"]>>[1]): boolean {
  const m = canonicalMnemonic(line) ?? "";
  return m.startsWith("b") && !["bra", "bsr"].includes(m);
}

export const compareLongImmediateViaMoveq: Rule = {
  meta: {
    id: "optimization/compare-long-immediate-via-moveq",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Compare a small long immediate via MOVEQ and a dead scratch register",
    tags: ["tricks-and-traps", "68000", "speed", "size", "compare"],
    docs: { source: "Mike Morton, 68000 Tricks and Traps (BYTE, Sep 1986)" },
  },
  checkLine(ctx, line, index) {
    if (!isInstruction(line, "cmp") || instructionSize(line) !== "l") return;
    const expr = immediateExpressionOperand(line, 0);
    const dst = dataRegisterOperand(line, 1);
    if (!expr || !dst) return;
    const value = ctx.evaluate(expr);
    if (!value.known || value.value < -128 || value.value > 127) return;
    const target = normalizeRegister(dst.register);
    if (!target) return;
    const scratch = ctx.registers.deadDataRegistersAfter(index).find((r) => r !== target);
    if (!scratch) return;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `CMP.L #${value.value},${target.toUpperCase()} can use MOVEQ plus register CMP`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Load the small constant with MOVEQ into ${scratch.toUpperCase()} and compare registers`,
        replacement: `moveq #${value.value},${scratch}\ncmp.l ${scratch},${target}`,
        applicability: "safe",
      },
      notes: [
        {
          message:
            "Tricks and Traps recommends this for small long-immediate comparisons; the scratch register is proven dead here.",
        },
      ],
    });
  },
};

export const destructiveSmallCompareBranch: Rule = {
  meta: {
    id: "optimization/destructive-small-compare-branch",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Use SUBQ for a small compare when the compared register is disposable",
    tags: ["tricks-and-traps", "68000", "speed", "size", "compare", "branch", "ccr"],
    docs: { source: "Mike Morton, 68000 Tricks and Traps (BYTE, Sep 1986)" },
  },
  checkLine(ctx, line, index) {
    if (!isInstruction(line, "cmp")) return;
    const size = instructionSize(line);
    if (size !== "w" && size !== "l") return;
    const expr = immediateExpressionOperand(line, 0);
    const dst = dataRegisterOperand(line, 1);
    if (!expr || !dst) return;
    const value = ctx.evaluate(expr);
    if (!value.known || value.value < 1 || value.value > 8) return;
    const reg = normalizeRegister(dst.register);
    if (!reg) return;
    const next = ctx.nextInstruction(index);
    if (!next || !isConditionalBranch(next.line) || hasLabelBetween(ctx, index, next.index)) return;
    if (ctx.registers.isLiveAfter(next.index, reg) !== "dead") return;
    if (ctx.flags.isLiveAfter(next.index, "X") !== "dead") return;
    const branch = canonicalMnemonic(next.line)!;
    const branchTarget = sourceOperand(ctx, next.line, 0);
    if (!branchTarget) return;
    const branchSize = instructionSize(next.line);
    const suffix = branchSize ? `.${branchSize}` : "";

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `CMP.${size.toUpperCase()} #${value.value},${reg.toUpperCase()} followed by ${branch.toUpperCase()} can use destructive SUBQ`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: "Use SUBQ to set the same NZVC flags because the compared register and X are dead afterwards",
        replacement: `subq.${size} #${value.value},${reg}\n${branch}${suffix} ${branchTarget}`,
        applicability: "safe",
      },
      notes: [
        {
          message:
            "Restricted to positive 1..8 immediates so SUBQ reproduces CMP subtraction flags exactly; negative ADDQ forms need separate carry-condition reasoning.",
        },
      ],
      data: { secondInstructionIndex: next.index },
    });
  },
};

export const jsrJmpDispatch: Rule = {
  meta: {
    id: "optimization/jsr-jmp-tail-dispatch",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Replace JSR sub / JMP next with PEA next / JMP sub",
    tags: ["tricks-and-traps", "68000", "control-flow", "speed"],
    docs: { source: "Mike Morton, 68000 Tricks and Traps (BYTE, Sep 1986)" },
  },
  checkLine(ctx, line, index) {
    if (!isInstruction(line, "jsr")) return;
    const next = ctx.nextInstruction(index);
    if (!next || !isInstruction(next.line, "jmp") || hasLabelBetween(ctx, index, next.index)) return;
    const sub = sourceOperand(ctx, line, 0);
    const cont = sourceOperand(ctx, next.line, 0);
    if (!sub || !cont) return;
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "high",
      message: "JSR followed by JMP can pre-push the continuation and jump directly to the subroutine",
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Push ${cont} as the return address, then JMP directly to ${sub}`,
        replacement: `pea ${cont}\njmp ${sub}`,
        applicability: "manual",
      },
      notes: [
        { message: "For an ordinary RTS return this reaches the same continuation with the same stack depth." },
        {
          message:
            "The return-address value visible to the callee changes from the address of the original JMP instruction to the final continuation target; review code that inspects or edits its return address.",
        },
      ],
      data: { secondInstructionIndex: next.index },
    });
  },
};
