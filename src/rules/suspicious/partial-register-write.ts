import type { Rule } from "../../core/rule.js";
import { semanticMnemonic } from "../../semantics/mnemonics.js";
import { dataRegisterOperand, instructionSize } from "../../util/ast.js";

export const partialRegisterWrite: Rule = {
  meta: {
    id: "suspicious/partial-register-write",
    category: "suspicious",
    defaultSeverity: "warning",
    description: "Flag byte/word MOVE writes whose preserved upper bits are subsequently used",
    docs: {
      note: "A register seeded with a known value first is the normal zero- or sign-extension idiom, so those are not flagged. This is for the case where the preserved bits are whatever happened to be there.",
    },
    tags: ["data-registers", "partial-width", "dataflow"],
  },

  checkLine(ctx, line, index) {
    if (semanticMnemonic(line) !== "move") return;
    const size = instructionSize(line);
    if (size !== "b" && size !== "w") return;
    const destination = dataRegisterOperand(line, 1);
    if (!destination) return;

    const upperMask = size === "b" ? 0xffffff00 : 0xffff0000;
    const use = ctx.registers.registerBitsUseAfter(index, destination.register, upperMask);
    if (use !== "used") return;

    // Seeding the register with a known value and then writing part of it is
    // the ordinary way to zero- or sign-extend a narrow load:
    //
    //   moveq  #0,d2
    //   move.b 0(a2,d1.w),d2
    //
    // The preserved bits are the point, not an oversight. Constant propagation
    // supplies the value, so the seed does not have to be the previous
    // instruction, and CLR works as well as MOVEQ.
    if (ctx.registers.knownConstantBefore(index, destination.register) !== undefined) return;

    const preserved = size === "b" ? "upper 24 bits" : "upper 16 bits";
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "medium",
      message: `MOVE.${size.toUpperCase()} preserves the ${preserved} of ${destination.register.toUpperCase()}, and later code reads them`,
      loc: line.mnemonic!.loc,
      suggestion: {
        description:
          "Review whether the preserved upper bits are intentional; clear/extend or use a full-width write if not",
        applicability: "manual",
      },
    });
  },
};
