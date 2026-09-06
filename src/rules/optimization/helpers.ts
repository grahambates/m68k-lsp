import type { ExpressionNode, ParsedLine } from "m68k-parser";
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

/**
 * Whether a label sits between two instructions. A label means control can
 * arrive without passing the first, so a fold spanning the pair is unsafe.
 */
export function hasLabelBetween(ctx: RuleContext, from: number, to: number): boolean {
  for (let i = from + 1; i <= to; i++) if (ctx.line(i)?.label) return true;
  return false;
}

export function changedFlagsApplicability(ctx: RuleContext, index: number, flags: readonly Flag[]) {
  const states = flags.map((flag) => ctx.flags.isLiveAfter(index, flag));
  if (states.every((state) => state === "dead"))
    return { applicability: "safe" as const, confidence: "certain" as const };
  if (states.some((state) => state === "live"))
    return { applicability: "conditional" as const, confidence: "high" as const };
  return { applicability: "conditional" as const, confidence: "medium" as const };
}

export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

/**
 * How to write a value in a replacement.
 *
 * Where a rule carries a value through unchanged -- `move.l #N,d0` becoming
 * `moveq #N,d0`, `adda.w #N,a3` becoming `lea N(a3),a3` -- the replacement uses
 * the expression exactly as it was written. Substituting the number it
 * evaluates to produces a correct instruction and a bad edit: it throws away
 * the name that says what the value means, and freezes a number that was
 * supposed to track the constant when it changes. `SCREEN_BW/2+(SCREEN_H/2*SCREEN_BW)`
 * must not become `1610`.
 *
 * The number is used only when the text cannot be recovered, which happens for
 * a value the rule derived rather than copied.
 */
export function valueText(ctx: RuleContext, expression: ExpressionNode | undefined, evaluated: number): string {
  return operandText(ctx, expression) ?? String(evaluated);
}

/**
 * An expression as written, made safe to drop into an operand field.
 *
 * Two things have to be normalised. Whitespace is removed, because an
 * assembler ends the operand field at the first space, so a faithful copy of
 * `SCREEN_BW / 2 + 10` would truncate to `SCREEN_BW`. And redundant enclosing
 * parentheses are dropped, because a displacement that opens with `(` reads
 * like an addressing mode: `(SCREEN_BW*2)(a3)` is ambiguous where
 * `SCREEN_BW*2(a3)` is not. Neither changes what the expression means; 68k
 * expression syntax has no token in which a space is significant, once string
 * literals are excluded, which every caller already does.
 */
function operandText(ctx: RuleContext, expression: ExpressionNode | undefined): string | undefined {
  let node = expression;
  while (node?.type === "group") node = node.expression;
  const text = ctx.sourceTextOf(node)?.replace(/\s+/g, "");
  return text ? text : undefined;
}

/**
 * The same, negated, for rules turning a subtraction into an addition.
 *
 * Only a bare symbol or number is negated in place. Anything compound would
 * need `-(...)`, and an operand opening with `-(` is how predecrement is
 * written, so rather than emit something an assembler may read as `-(An)` the
 * evaluated number is used. `-SCREEN_BW/2` cannot be used either: unary minus
 * binds tighter than the division, so it is not the negation of the whole
 * expression.
 */
export function negatedValueText(ctx: RuleContext, expression: ExpressionNode | undefined, negated: number): string {
  // Negating a minus gives the thing back, so `lea -SMALL(a0),a0` can become
  // `subq.w #SMALL,a0` rather than falling back to a number.
  if (expression?.type === "unary-op" && expression.operator === "-") {
    const inner = isAtom(expression.operand) ? operandText(ctx, expression.operand) : undefined;
    if (inner) return inner;
  }
  const text = isAtom(expression) ? operandText(ctx, expression) : undefined;
  return text ? `-${text}` : String(negated);
}

function isAtom(expression: ExpressionNode | undefined): boolean {
  return expression?.type === "symbol" || expression?.type === "numeric-literal";
}
