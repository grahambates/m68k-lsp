import type { OperandNode, ParsedLine } from "m68k-parser";
import type { Rule } from "../../core/rule.js";
import { dataRegisterOperand, instructionSize, isInstruction, operand } from "../../util/ast.js";
import { isAddressRegisterWriteWithoutCCR } from "../../semantics/flags.js";
import { semanticMnemonic } from "../../semantics/mnemonics.js";
import { normalizeRegister, registersReadByOperand, type Register } from "../../semantics/registers.js";
import { changedFlagsApplicability, hasLabelBetween, sourceOperand } from "./helpers.js";

/**
 * Operations whose `<ea>,Dn` form can absorb the load directly.
 *
 * EOR is deliberately absent: the 68k only encodes `EOR Dn,<ea>`, so there is
 * no `EOR <ea>,Dn` for a folded source to go into. Writing one produces an
 * instruction the assembler will reject, which is why this cannot simply be
 * "any operation taking a source EA".
 */
const FOLDABLE = new Set(["add", "adda", "sub", "suba", "and", "or", "cmp", "cmpa"]);

/**
 * Source addressing modes that read the same value at the second instruction's
 * position as they did at the first. Post-increment and pre-decrement are left
 * out for now: they are probably foldable too, since the single side effect
 * happens either way, but they interact with the destination-register check
 * below in ways worth proving separately.
 */
const FOLDABLE_SOURCE = [
  "address-register-indirect",
  "address-register-indirect-displacement",
  "address-register-indirect-index",
  "absolute-address",
  "pc-relative",
  "pc-relative-index",
];

function foldableSource(op: OperandNode | undefined): boolean {
  return !!op && FOLDABLE_SOURCE.includes(op.type);
}

function destinationRegister(line: ParsedLine): Register | undefined {
  const op = operand(line, 1);
  if (op?.type === "data-register" || op?.type === "address-register") return normalizeRegister(op.register);
  return undefined;
}

/**
 * A load into a scratch register that the next instruction immediately
 * consumes, and nothing else does, is a whole instruction that the operation
 * could have performed itself:
 *
 *   move.w x_speed,d1        add.w x_speed,d0
 *   add.w  d1,d0        ->
 *
 * Always two bytes shorter, and measurably quicker (68kcounter: 20 cycles
 * against 16 for that example on 68000).
 */
export const foldLoadIntoOperation: Rule = {
  meta: {
    id: "optimization/fold-load-into-operation",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Fold a load into a dead scratch register into the operation that consumes it",
    tags: ["peephole", "register-analysis", "scratch-register", "native"],
    docs: {
      note: "Found by mining a corpus of real Amiga assembly for loads whose scratch register is used exactly once, then verified with 68kcounter.",
    },
  },

  checkLine(ctx, line, index) {
    if (!isInstruction(line, "move")) return;
    const size = instructionSize(line);
    if (size !== "b" && size !== "w" && size !== "l") return;
    const source = operand(line, 0);
    const scratchOperand = dataRegisterOperand(line, 1);
    if (!foldableSource(source) || !scratchOperand) return;
    const scratch = normalizeRegister(scratchOperand.register);
    if (!scratch) return;

    const next = ctx.nextInstruction(index);
    if (!next || hasLabelBetween(ctx, index, next.index)) return;
    const mnemonic = semanticMnemonic(next.line);
    if (!mnemonic || !FOLDABLE.has(mnemonic)) return;
    if (instructionSize(next.line) !== size) return;

    // The scratch register has to be what the operation reads, and it must not
    // also be what the operation writes -- `add.w d1,d1` has nowhere to fold to.
    const consumed = dataRegisterOperand(next.line, 0);
    if (!consumed || normalizeRegister(consumed.register) !== scratch) return;
    const destination = destinationRegister(next.line);
    if (!destination || destination === scratch) return;

    // ADDA.B/SUBA.B do not exist, so a byte-sized fold has nowhere to go.
    const addressDestination = operand(next.line, 1)?.type === "address-register";
    if (addressDestination && size === "b") return;

    // Folding moves the load to where the operation is, so the operation's own
    // destination must not be part of the address being loaded from.
    if (registersReadByOperand(source).has(destination)) return;

    // Nothing else may need the loaded value.
    if (ctx.registers.isLiveAfter(next.index, scratch) !== "dead") return;

    const sourceText = sourceOperand(ctx, line, 0);
    const destinationText = sourceOperand(ctx, next.line, 1);
    const written =
      next.line.mnemonic?.type === "instruction" ? next.line.mnemonic.instruction.toLowerCase() : undefined;
    if (!sourceText || !destinationText || !written) return;

    // ADDA/SUBA leave the condition codes alone, so the MOVE's N/Z/V/C are the
    // ones that survive the original pair. Folding the MOVE away removes them,
    // which only matters if something downstream reads them. Every other
    // operation here sets N/Z/V/C itself, overwriting the MOVE's either way.
    const preservesCcr = isAddressRegisterWriteWithoutCCR(next.line);
    const safety = preservesCcr
      ? changedFlagsApplicability(ctx, next.index, ["N", "Z", "V", "C"])
      : { applicability: "safe" as const, confidence: "certain" as const };

    const replacement = `${written}.${size} ${sourceText},${destinationText}`;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: safety.confidence,
      message: `${scratch.toUpperCase()} only carries ${sourceText} into the next instruction, which can read it directly`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Use ${replacement.toUpperCase()} and drop the separate load`,
        replacement,
        applicability: safety.applicability,
      },
      notes: [
        {
          message: `${scratch.toUpperCase()} is proven dead after the pair, so the loaded copy is not needed.`,
        },
        ...(preservesCcr && safety.applicability !== "safe"
          ? [
              {
                message:
                  "The folded form drops the MOVE's N/Z/V/C, which this operation does not set for an address-register destination; review later flag use.",
              },
            ]
          : []),
      ],
      data: { sourceEndIndex: next.index, scratch },
    });
  },
};
