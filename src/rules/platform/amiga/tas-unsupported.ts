import type { Rule } from "../../../core/rule.js";
import { isInstruction, operand } from "../../../util/ast.js";

/**
 * The problem is the locked read-modify-write bus cycle TAS uses to reach
 * memory, which the custom-chip DMA architecture cannot arbitrate. `TAS Dn`
 * performs no memory access at all, so it is safe and is not flagged.
 */
export const amigaTasUnsupported: Rule = {
  meta: {
    id: "correctness/amiga-tas-unsupported",
    category: "correctness",
    defaultSeverity: "error",
    platforms: ["amiga"],
    description: "TAS is not supported by the Amiga architecture",
    tags: ["amiga", "hardware", "tas"],
    docs: {
      source: "Amiga Hardware Reference Manual",
      note: "Processor multiprocessor-support features such as TAS are not supported by the Amiga architecture.",
    },
  },
  checkLine(ctx, line) {
    if (!isInstruction(line, "tas")) return;
    // A data-register operand never touches the bus.
    if (operand(line, 0)?.type === "data-register") return;
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: "TAS on memory is not supported on Amiga hardware",
      loc: line.mnemonic!.loc,
      notes: [
        {
          message:
            "The locked read-modify-write cycle TAS uses to reach memory cannot be arbitrated against custom-chip DMA. TAS on a data register is unaffected, since it performs no memory access.",
        },
      ],
    });
  },
};
