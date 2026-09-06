import type { ParsedLine } from "m68k-parser";
import type { RuleContext } from "../../../core/context.js";
import type { Rule } from "../../../core/rule.js";
import { semanticMnemonic } from "../../../semantics/mnemonics.js";
import {
  immediateExpressionOperand,
  instructionSize,
  operand,
  predecrementAddressRegister,
} from "../../../util/ast.js";

/**
 * GEMDOS, BIOS and XBIOS take their parameters on the stack and leave them
 * there: the caller removes them. TRAP #2 is excluded because GEM passes a
 * parameter block in registers instead, so there is nothing to clean up.
 */
const STACK_TRAPS = new Map<number, string>([
  [1, "GEMDOS"],
  [13, "BIOS"],
  [14, "XBIOS"],
]);

/**
 * GEMDOS calls that never return, so their parameters are never removed. The
 * opcodes have been stable since TOS 1.0.
 */
const NON_RETURNING_GEMDOS = new Map<number, string>([
  [0x00, "Pterm0"],
  [0x31, "Ptermres"],
  [0x4c, "Pterm"],
]);

function isStackPointer(line: ParsedLine, index: number): boolean {
  const register = predecrementAddressRegister(line, index);
  const name = register?.register.toLowerCase();
  return name === "a7" || name === "sp";
}

/** Bytes a single instruction pushes, or undefined when it is not a plain push. */
function pushedBytes(line: ParsedLine): number | undefined {
  const mnemonic = semanticMnemonic(line);
  if (mnemonic === "pea") return 4;
  if (mnemonic !== "move" && mnemonic !== "clr") return undefined;

  const destination = mnemonic === "clr" ? 0 : 1;
  if (!isStackPointer(line, destination)) return undefined;

  switch (instructionSize(line)) {
    // A7 is special-cased: a byte push still moves the stack pointer by two so
    // it stays word-aligned.
    case "b":
    case "w":
      return 2;
    case "l":
      return 4;
    default:
      return undefined;
  }
}

function isStackPointerOperand(line: ParsedLine, index: number): boolean {
  const op = operand(line, index);
  if (op?.type !== "address-register") return false;
  const name = op.register.toLowerCase();
  return name === "a7" || name === "sp";
}

/** Bytes a single instruction removes from the stack, or undefined. */
function releasedBytes(ctx: RuleContext, line: ParsedLine): number | undefined {
  const mnemonic = semanticMnemonic(line);

  // ADDQ keeps its own mnemonic; ADD with an address-register destination
  // normalizes to ADDA. Stack cleanup is written both ways.
  if (mnemonic === "add" || mnemonic === "adda" || mnemonic === "addq") {
    if (!isStackPointerOperand(line, 1)) return undefined;
    const expr = immediateExpressionOperand(line, 0);
    if (!expr) return undefined;
    const value = ctx.evaluate(expr);
    return value.known && value.value > 0 ? value.value : undefined;
  }

  // LEA n(sp),sp is the usual way to drop more than eight bytes.
  if (mnemonic === "lea") {
    if (!isStackPointerOperand(line, 1)) return undefined;
    const source = operand(line, 0);
    if (source?.type !== "address-register-indirect-displacement") return undefined;
    if (source.register.type !== "address-register") return undefined;
    const base = source.register.register.toLowerCase();
    if (base !== "a7" && base !== "sp") return undefined;
    const value = ctx.evaluate(source.displacement);
    return value.known && value.value > 0 ? value.value : undefined;
  }

  return undefined;
}

function trapVector(ctx: RuleContext, line: ParsedLine): number | undefined {
  if (semanticMnemonic(line) !== "trap") return undefined;
  const expr = immediateExpressionOperand(line, 0);
  if (!expr) return undefined;
  const value = ctx.evaluate(expr);
  return value.known ? value.value : undefined;
}

export const atariTrapStackCleanup: Rule = {
  meta: {
    id: "suspicious/atari-trap-stack-cleanup",
    category: "suspicious",
    defaultSeverity: "warning",
    platforms: ["atari"],
    description: "Check that TOS trap parameters are removed from the stack by the caller",
    tags: ["atari", "tos", "stack", "calling-convention"],
    docs: {
      note: "GEMDOS/BIOS/XBIOS are caller-cleans-stack. This checks the pushes immediately before a trap against the adjustment immediately after, so it needs no table of TOS function signatures and does not depend on the TOS version.",
    },
  },

  checkLine(ctx, line, index) {
    const vector = trapVector(ctx, line);
    if (vector === undefined) return;
    const api = STACK_TRAPS.get(vector);
    if (!api) return;

    // Walk back over the contiguous run of pushes feeding this call. Any other
    // instruction, or a label that lets control arrive from elsewhere, ends it.
    let pushed = 0;
    let lastOpcodeWord: number | undefined;
    for (let i = index - 1; i >= 0; i--) {
      const previous = ctx.line(i);
      if (!previous) break;
      if (previous.mnemonic?.type !== "instruction") {
        if (previous.label) break;
        continue;
      }
      if (previous.label) break;
      const bytes = pushedBytes(previous);
      if (bytes === undefined) break;
      // The word pushed last is the function opcode.
      if (lastOpcodeWord === undefined && bytes === 2) {
        const immediate = immediateExpressionOperand(previous, 0);
        const value = immediate ? ctx.evaluate(immediate) : undefined;
        lastOpcodeWord = value?.known ? value.value : undefined;
      }
      pushed += bytes;
    }
    if (pushed === 0) return;

    if (vector === 1 && lastOpcodeWord !== undefined && NON_RETURNING_GEMDOS.has(lastOpcodeWord)) return;

    const next = ctx.nextInstruction(index);
    const released = next ? releasedBytes(ctx, next.line) : undefined;
    if (released === pushed) return;

    // No adjustment at all is reported separately from a wrong one: the first is
    // usually a forgotten cleanup, the second an arithmetic slip.
    const detail =
      released === undefined
        ? `nothing is removed afterwards`
        : `${released} ${released === 1 ? "byte is" : "bytes are"} removed afterwards`;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: released === undefined ? "medium" : "high",
      message: `${pushed} bytes are pushed for this ${api} call but ${detail}`,
      loc: line.mnemonic!.loc,
      notes: [
        { message: `${api} takes its parameters on the stack and the caller removes them.` },
        {
          message:
            "Suppress this inline if the call does not return, or if the stack is unwound elsewhere, for example by restoring a saved stack pointer.",
        },
      ],
      suggestion: {
        description: `Remove ${pushed} bytes after the trap, e.g. ${pushed <= 8 ? `addq.l #${pushed},sp` : `lea ${pushed}(sp),sp`}`,
        applicability: "manual",
      },
      data: { pushedBytes: pushed, releasedBytes: released, trapVector: vector },
    });
  },
};
