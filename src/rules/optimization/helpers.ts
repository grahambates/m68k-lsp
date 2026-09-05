import type { ParsedLine } from "m68k-parser";
import type { RuleContext } from "../../core/context.js";
import type { Flag } from "../../semantics/flags.js";

export function sourceOperand(ctx: RuleContext, line: ParsedLine, operandIndex: number): string | undefined {
  const op = line.operands?.[operandIndex];
  if (!op) return undefined;
  return ctx.sourceLine((line.lineNumber ?? 1) - 1)?.slice(op.loc.start, op.loc.end);
}

/**
 * Rewrite one operand in place and return the whole source line.
 *
 * Suggestion replacements are line-scoped: `measureDiagnosticImpact` measures the
 * replacement against the full source line span, and consumers apply it the same
 * way. An operand-level rewrite therefore still has to produce a complete
 * instruction, not just the new operand text.
 */
export function replaceOperandInLine(
  ctx: RuleContext,
  line: ParsedLine,
  operandIndex: number,
  text: string,
): string | undefined {
  const op = line.operands?.[operandIndex];
  if (!op) return undefined;
  const source = ctx.sourceLine((line.lineNumber ?? 1) - 1);
  if (source === undefined) return undefined;
  return `${source.slice(0, op.loc.start)}${text}${source.slice(op.loc.end)}`.trim();
}

export function changedFlagsApplicability(ctx: RuleContext, index: number, flags: readonly Flag[]) {
  const states = flags.map((flag) => ctx.flags.isLiveAfter(index, flag));
  if (states.every((state) => state === "dead")) return { applicability: "safe" as const, confidence: "certain" as const };
  if (states.some((state) => state === "live")) return { applicability: "conditional" as const, confidence: "high" as const };
  return { applicability: "conditional" as const, confidence: "medium" as const };
}

export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}
