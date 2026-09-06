import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, dataRegisterOperand, instructionSize } from "../../util/ast.js";
import { hasLabelBetween, sourceOperand } from "./helpers.js";
import { semanticMnemonic } from "../../semantics/mnemonics.js";

/**
 * Adding an index to an address register purely to dereference it is what the
 * indexed addressing mode already does:
 *
 *   add.w  d4,a0          move.l (a0,d4.w),a1
 *   move.l (a0),a1   ->
 *
 * Only valid when the adjusted address register is dead afterwards, since the
 * fold leaves it unchanged.
 */
export const foldIndexIntoEffectiveAddress: Rule = {
  meta: {
    id: "optimization/fold-index-into-effective-address",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Fold an address-register index addition into the indexed addressing mode",
    tags: ["addressing", "address-register", "sequence", "size", "speed"],
    docs: { source: "EAB 68000 code optimisations" },
  },

  checkLine(ctx, line, index) {
    // ADD/ADDA with a data-register source and address-register destination.
    if (semanticMnemonic(line) !== "adda") return;
    const size = instructionSize(line);
    if (size !== "w" && size !== "l") return;
    const indexRegister = dataRegisterOperand(line, 0);
    const base = addressRegisterOperand(line, 1);
    if (!indexRegister || !base) return;

    const next = ctx.nextInstruction(index);
    if (!next || hasLabelBetween(ctx, index, next.index)) return;

    // The very next instruction must dereference the adjusted register with no
    // displacement, which is the form the indexed mode replaces exactly.
    const uses = (next.line.operands ?? []).findIndex(
      (op) =>
        op.type === "address-register-indirect" &&
        op.register.type === "address-register" &&
        op.register.register.toLowerCase() === base.register.toLowerCase(),
    );
    if (uses < 0) return;

    // The fold never updates the base, so anything that reads it afterwards
    // would see a different value.
    if (ctx.registers.isLiveAfter(next.index, base.register) !== "dead") return;
    // The index register has to survive to the point of use, which it does
    // here, but it must not be the destination of the dereferencing move.
    const written = dataRegisterOperand(next.line, 1);
    if (written && written.register.toLowerCase() === indexRegister.register.toLowerCase()) return;

    const operandText = sourceOperand(ctx, next.line, uses);
    if (!operandText) return;
    const replacementOperand = `(${base.register},${indexRegister.register}.${size})`;
    const rest = (next.line.operands ?? []).map((_, i) =>
      i === uses ? replacementOperand : sourceOperand(ctx, next.line, i),
    );
    if (rest.some((text) => text === undefined)) return;

    const mnemonicText = next.line.mnemonic?.type === "instruction" ? next.line.mnemonic.instruction : undefined;
    if (!mnemonicText) return;
    const suffix = instructionSize(next.line);
    const replacement = `${mnemonicText.toLowerCase()}${suffix ? `.${suffix}` : ""} ${rest.join(",")}`;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "high",
      message: `${base.register.toUpperCase()} is only adjusted to be dereferenced, which the indexed mode does directly`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Use ${replacementOperand} and drop the separate addition`,
        replacement,
        applicability: "safe",
      },
      notes: [
        {
          message: `The indexed mode computes ${base.register.toUpperCase()} plus ${indexRegister.register.toUpperCase()} as part of the access, so the addition is not needed.`,
        },
        {
          message: `${base.register.toUpperCase()} keeps its original value afterwards, which is proven unused here. ADDA does not affect the condition codes, so none are lost.`,
        },
      ],
      data: { base: base.register, index: indexRegister.register, sourceEndIndex: next.index },
    });
  },
};
