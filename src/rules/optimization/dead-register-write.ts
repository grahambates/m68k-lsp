import type { OperandNode, ParsedLine } from "m68k-parser";
import type { Rule } from "../../core/rule.js";
import { getFlagSemantics } from "../../semantics/flags.js";
import { getRegisterSemantics } from "../../semantics/registers.js";
import { semanticMnemonic } from "../../semantics/mnemonics.js";

/**
 * A write whose value is overwritten before anything reads it does nothing:
 *
 *   move.w d0,d1      <- d1 is never read
 *   move.w d2,d1
 *   move.w d1,foo(a0)
 *
 * Often a typo — the first write was meant for a different register — so the
 * instruction is worth looking at even where the wasted cycles do not matter.
 *
 * Deliberately narrow. The instruction must do nothing except write one
 * register and set flags, both of which have to be provably unused. Anything
 * that touches memory is excluded: a load can be from a hardware register that
 * changes state when read, and removing it would change behaviour rather than
 * just save time.
 */
const CONTROL_FLOW_SAFE = new Set(["none", "fallthrough"]);

/** Operands that are just a register or a literal, with nothing else going on. */
function isInertOperand(op: OperandNode): boolean {
  return op.type === "data-register" || op.type === "address-register" || op.type === "immediate";
}

function hasOnlyInertOperands(line: ParsedLine, mnemonic: string): boolean {
  const operands = line.operands ?? [];
  if (!operands.length) return false;
  // LEA computes an address without dereferencing it, and its source must be a
  // control addressing mode, so it can never carry a side effect however the
  // operand is written.
  if (mnemonic === "lea") return true;
  return operands.every(isInertOperand);
}

export const deadRegisterWrite: Rule = {
  meta: {
    id: "optimization/dead-register-write",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Remove a register write whose value is overwritten before it is read",
    tags: ["dataflow", "register-analysis", "dead-code", "size", "speed"],
    docs: {
      note: "Restricted to instructions that only write one register and its flags, with register or immediate operands. Memory is excluded because a load may be from a location that changes state when read.",
    },
  },

  checkLine(ctx, line, index) {
    const mnemonic = semanticMnemonic(line);
    if (!mnemonic) return;
    if (!hasOnlyInertOperands(line, mnemonic)) return;

    const registers = getRegisterSemantics(line);
    if (registers.unknownEffects || registers.call) return;
    // Exactly one register written, so MOVEM and friends are out, and the
    // instruction must not read the register it writes: `add d0,d1` reads d1,
    // but removing it is still sound only if d1 is dead, which the check below
    // establishes. What matters here is that nothing else is affected.
    if (registers.writes.size !== 1) return;
    const [written] = [...registers.writes];

    const flags = getFlagSemantics(line);
    if (!CONTROL_FLOW_SAFE.has(flags.controlFlow)) return;

    if (ctx.registers.isLiveAfter(index, written) !== "dead") return;
    // Removing the instruction removes its flag effects too.
    for (const flag of [...flags.writes, ...flags.undefined]) {
      if (ctx.flags.isLiveAfter(index, flag) !== "dead") return;
    }

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: `${written.toUpperCase()} is overwritten before it is read, so this instruction has no effect`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: "Remove the instruction",
        replacement: "",
        applicability: "safe",
      },
      notes: [
        { message: `Nothing reads ${written.toUpperCase()} between this write and the next one.` },
        { message: "The condition codes it sets are also unused, so removing it changes nothing." },
        {
          message:
            "Worth checking the destination is the register you meant: a write nothing reads is often a typo rather than dead weight.",
        },
      ],
      data: { register: written },
    });
  },
};
