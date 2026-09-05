import type { Rule } from "../../core/rule.js";
import { canonicalMnemonic, semanticMnemonic } from "../../semantics/mnemonics.js";
import { addressRegisterOperand, instructionSize } from "../../util/ast.js";

export const moveaWordSignExtension: Rule = {
  meta: {
    id: "suspicious/movea-word-sign-extension",
    category: "suspicious",
    defaultSeverity: "warning",
    description:
      "Flag generic MOVE.W spellings to address registers because they have MOVEA.W sign-extension semantics",
    tags: ["address-registers", "sign-extension", "partial-width"],
    docs: {
      source: "Motorola 68000 Family Programmer's Reference Manual",
      note: "MOVEA.W sign-extends its 16-bit source and loads all 32 bits of the address register.",
    },
  },

  checkLine(ctx, line) {
    if (semanticMnemonic(line) !== "movea" || canonicalMnemonic(line) !== "move" || instructionSize(line) !== "w")
      return;
    const destination = addressRegisterOperand(line, 1);
    if (!destination) return;

    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "high",
      message: `MOVEA.W sign-extends the source to all 32 bits of ${destination.register.toUpperCase()}`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description: "Review whether a sign-extended 16-bit address is intended; use .L for a full 32-bit value",
        applicability: "manual",
      },
      notes: [{ message: "This is not a 16-bit partial write: values $8000..$FFFF become $FFFF8000..$FFFFFFFF." }],
    });
  },
};
