import type { Rule } from "../../core/rule.js";
import type { RuleContext } from "../../core/context.js";
import { dataRegisterOperand, immediateExpressionOperand, instructionSize, isInstruction } from "../../util/ast.js";
import { canonicalMnemonic } from "../../semantics/mnemonics.js";
import { changedFlagsApplicability } from "./helpers.js";

function m68000Only(ctx: RuleContext): boolean {
  return ctx.config.processors.every((cpu) => cpu === "mc68000");
}

function hasInterveningLabel(ctx: RuleContext, from: number, to: number): boolean {
  for (let i = from + 1; i <= to; i++) if (ctx.line(i)?.label) return true;
  return false;
}

function precedingMoveq(ctx: RuleContext, index: number, register: string, count: number) {
  const previous = ctx.previousInstruction(index);
  if (!previous || hasInterveningLabel(ctx, previous.index, index) || !isInstruction(previous.line, "moveq"))
    return undefined;
  const expr = immediateExpressionOperand(previous.line, 0);
  const dst = dataRegisterOperand(previous.line, 1);
  if (!expr || !dst || dst.register.toLowerCase() !== register) return undefined;
  const value = ctx.evaluate(expr);
  if (!value.known || value.value !== count) return undefined;
  return previous;
}

function canRemoveCountSetup(
  ctx: RuleContext,
  setupIndex: number,
  shiftIndex: number,
  register: string,
  count: number,
): boolean {
  if (ctx.registers.isLiveAfter(shiftIndex, register) === "dead") return true;
  return ctx.registers.knownConstantBefore(setupIndex, register) === count;
}

function stackNotes(flagSafe: boolean, countNote?: string) {
  return [
    ...(countNote ? [{ message: countNote }] : []),
    { message: "SP is restored exactly; the replacement temporarily uses 2 bytes of stack." },
    {
      message:
        "The replacement writes stack memory and introduces memory/bus-fault observability that the original register shift did not have.",
    },
    ...(flagSafe ? [] : [{ message: "CCR results differ from the original shift; changed flags must be unobserved." }]),
  ];
}

/** Immediate word shifts using the 68000 A7 byte-alignment behaviour. */
export const stackAlignedWordShiftByEight: Rule = {
  meta: {
    id: "optimization/stack-word-shift-eight",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Use the 68000 A7 byte-alignment quirk for a word shift by eight",
    tags: ["flamewing", "68000", "shift", "stack", "speed", "size-tradeoff", "ccr"],
    docs: {
      source: "Flamewing M68000 Peephole Optimizations / 68000 Tricks and Traps",
      note: "Uses two temporary stack bytes and restores SP exactly.",
    },
  },
  checkLine(ctx, line, index) {
    if (!m68000Only(ctx)) return;
    const mnemonic = canonicalMnemonic(line);
    if (mnemonic !== "lsl" && mnemonic !== "asl" && mnemonic !== "lsr" && mnemonic !== "asr") return;
    if (instructionSize(line) !== "w") return;

    const count = immediateExpressionOperand(line, 0);
    const dst = dataRegisterOperand(line, 1);
    if (!count || !dst) return;
    const value = ctx.evaluate(count);
    if (!value.known || value.value !== 8) return;

    const reg = dst.register;
    let replacement: string;
    if (mnemonic === "lsr") {
      replacement = `move.w ${reg},-(sp)\nclr.w ${reg}\nmove.b (sp)+,${reg}`;
    } else if (mnemonic === "asr") {
      replacement = `move.w ${reg},-(sp)\nmove.b (sp)+,${reg}\next.w ${reg}`;
    } else {
      replacement = `move.b ${reg},-(sp)\nmove.w (sp)+,${reg}\nclr.b ${reg}`;
    }

    const safety = changedFlagsApplicability(ctx, index, ["X", "N", "Z", "V", "C"]);
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: safety.confidence,
      message: `${mnemonic.toUpperCase()}.W #8,${reg.toUpperCase()} can use the 68000 stack-alignment byte-lane trick`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: "Use A7's two-byte byte-stack adjustment to move the surviving byte into place",
        replacement,
        // Stack memory traffic is an observable side effect, but SP scratch itself is allowed.
        applicability: safety.applicability === "safe" ? "conditional" : safety.applicability,
      },
      notes: stackNotes(safety.applicability === "safe"),
      data: {
        provenance: "flamewing",
        stackScratch: true,
        temporaryStackBytes: 2,
        netStackBytes: 0,
        stackPointerRestored: true,
        writesStackMemory: true,
        shiftCount: 8,
      },
    });
  },
};

/**
 * Register-count variants where Flamewing's best 68000 sequence uses the same
 * two-byte A7 scratch trick.  The preceding MOVEQ is only removed when its
 * architectural value is disposable, exactly as for the non-stack rules.
 */
export const stackAlignedKnownRegisterShifts: Rule = {
  meta: {
    id: "optimization/stack-known-register-shift",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Use bounded A7 scratch space for selected known register-count shifts",
    tags: ["flamewing", "68000", "shift", "register-count", "stack", "speed", "size-tradeoff", "ccr"],
    docs: { source: "Flamewing M68000 Peephole Optimizations" },
  },
  checkLine(ctx, line, index) {
    if (!m68000Only(ctx)) return;
    const mnemonic = canonicalMnemonic(line);
    if (mnemonic !== "lsl" && mnemonic !== "asl" && mnemonic !== "lsr" && mnemonic !== "asr") return;
    const size = instructionSize(line);
    if (size !== "w" && size !== "l") return;
    const countOp = dataRegisterOperand(line, 0);
    const dst = dataRegisterOperand(line, 1);
    if (!countOp || !dst) return;
    const countReg = countOp.register.toLowerCase();
    if (countReg === dst.register.toLowerCase()) return;

    const known = ctx.registers.knownConstantBefore(index, countReg);
    if (known === undefined) return;
    const count = known & 63;
    const setup = precedingMoveq(ctx, index, countReg, known);
    if (!setup || !canRemoveCountSetup(ctx, setup.index, index, countReg, known)) return;

    const reg = dst.register;
    let replacement: string | undefined;
    if (size === "w" && (mnemonic === "lsl" || mnemonic === "asl") && count === 9) {
      replacement = `move.b ${reg},-(sp)\nmove.w (sp)+,${reg}\nclr.b ${reg}\nadd.w ${reg},${reg}`;
    } else if (size === "l" && (mnemonic === "lsl" || mnemonic === "asl") && count === 24) {
      replacement = `move.b ${reg},-(sp)\nmove.w (sp)+,${reg}\nclr.b ${reg}\nswap ${reg}\nclr.w ${reg}`;
    } else if (size === "l" && (mnemonic === "lsl" || mnemonic === "asl") && count === 25) {
      replacement = `move.b ${reg},-(sp)\nmove.w (sp)+,${reg}\nclr.b ${reg}\nadd.w ${reg},${reg}\nswap ${reg}\nclr.w ${reg}`;
    } else if (size === "l" && mnemonic === "lsr" && count === 24) {
      replacement = `swap ${reg}\nmove.w ${reg},-(sp)\nmoveq #0,${reg}\nmove.b (sp)+,${reg}`;
    } else if (size === "l" && mnemonic === "asr" && count === 24) {
      replacement = `swap ${reg}\next.l ${reg}\nmove.w ${reg},-(sp)\nmove.b (sp)+,${reg}\next.w ${reg}`;
    }
    if (!replacement) return;

    const safety = changedFlagsApplicability(ctx, index, ["X", "N", "Z", "V", "C"]);
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: safety.confidence,
      message: `${mnemonic.toUpperCase()}.${size.toUpperCase()} uses known count ${count}; a bounded stack-scratch form is faster on 68000`,
      loc: setup.line.mnemonic!.loc,
      suggestion: {
        description: "Replace the MOVEQ count setup and register-count shift with the A7 scratch sequence",
        replacement,
        applicability: safety.applicability === "safe" ? "conditional" : safety.applicability,
      },
      notes: stackNotes(
        safety.applicability === "safe",
        `${countOp.register.toUpperCase()} is dead afterwards or already held the same count before MOVEQ, so the count setup can be removed.`,
      ),
      data: {
        secondInstructionIndex: index,
        provenance: "flamewing",
        stackScratch: true,
        temporaryStackBytes: 2,
        netStackBytes: 0,
        stackPointerRestored: true,
        writesStackMemory: true,
        countRegister: countReg,
        shiftCount: count,
      },
    });
  },
};
