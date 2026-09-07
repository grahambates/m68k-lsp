import type { Rule } from "../../core/rule.js";
import { semanticMnemonic } from "../../semantics/mnemonics.js";
import { getRegisterSemantics, type Register } from "../../semantics/registers.js";
import type { RuleContext } from "../../core/context.js";
import { dataRegisterOperand, instructionSize } from "../../util/ast.js";


/**
 * The routine a line belongs to: from the nearest label that is not local, up
 * to the next one.
 *
 * A local label is a branch target inside a routine, so it does not start a new
 * one. Anything above the first global label, or below the last, is bounded by
 * the file.
 */
function enclosingBlock(ctx: RuleContext, index: number): { start: number; end: number } {
  let start = 0;
  for (let i = index; i >= 0; i--) {
    if (ctx.line(i)?.label?.scope === "global") {
      start = i;
      break;
    }
  }
  let end = ctx.file.lines.length;
  for (let i = index + 1; i < ctx.file.lines.length; i++) {
    if (ctx.line(i)?.label?.scope === "global") {
      end = i;
      break;
    }
  }
  return { start, end };
}

/**
 * Whether the routine writes the whole register anywhere.
 *
 * Building a long out of its halves is ordinary: a word into the low half, a
 * SWAP, a word into the other. Every one of those writes is partial, so on its
 * own each looks like it inherited whatever was above it. What separates that
 * from an oversight is whether the routine ever takes charge of the full
 * register at all -- a MOVE.L, a CLR.L, a MOVEQ, a SWAP. Where it does, the
 * halves are being managed deliberately and there is nothing to report.
 */
function writesWholeRegisterInBlock(ctx: RuleContext, register: Register, block: { start: number; end: number }): boolean {
  for (let i = block.start; i < block.end; i++) {
    const line = ctx.line(i);
    if (!line || line.mnemonic?.type !== "instruction") continue;
    const semantics = getRegisterSemantics(line);
    if (semantics.writes.has(register) && !semantics.partialWrites.has(register)) return true;
  }
  return false;
}

export const partialRegisterWrite: Rule = {
  meta: {
    id: "suspicious/partial-register-write",
    category: "suspicious",
    defaultSeverity: "warning",
    description: "Flag byte/word MOVE writes whose preserved upper bits are subsequently used",
    docs: {
      note: "Only reported where the routine never writes the register whole. Building a long from its halves, or seeding one with a known value first, accounts for the preserved bits; this is for the case where they are whatever happened to be there on entry.",
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

    // Writing the halves separately is a common way to build a long, and every
    // write in that pattern is partial. The question is whether the routine
    // ever writes the register whole; if it does, both halves are accounted for
    // and this is construction rather than an accident.
    const register = destination.register.toLowerCase() as Register;
    if (writesWholeRegisterInBlock(ctx, register, enclosingBlock(ctx, index))) return;

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
