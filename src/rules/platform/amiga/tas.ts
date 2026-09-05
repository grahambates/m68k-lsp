import type { Rule } from "../../../core/rule.js";
import { isInstruction } from "../../../util/ast.js";

/** The Amiga architecture does not support the 68000 TAS bus-locking protocol. */
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
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: "certain",
      message: "TAS is not supported on Amiga hardware",
      loc: line.mnemonic!.loc,
      notes: [
        { message: "The Amiga custom-chip DMA architecture does not support the 68000 TAS bus-locking protocol; replace TAS with an Amiga-safe synchronization/design pattern." },
      ],
    });
  },
};
