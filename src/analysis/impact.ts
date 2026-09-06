import * as counterNamespace from "68kcounter";
import { parseFile } from "m68k-parser";
import type { ExpressionNode, OperandNode, ParsedFile } from "m68k-parser";
import type {
  Diagnostic,
  OptimizationExecutionImpact,
  OptimizationImpact,
  OptimizationMetric,
  OptimizationSourceClaim,
} from "../core/diagnostic.js";

interface ImpactRuleMeta {
  meta: { docs?: { source?: string } };
}

type CounterTotals = {
  isRange: boolean;
  max: [number, number, number];
  bytes: number;
};
type CounterApi = {
  default?: unknown;
  calculateTotals?: (lines: unknown[]) => CounterTotals;
};

/** One resource triple: cycles, read cycles, write cycles. */
type Triple = [number, number, number];

/**
 * What 68kcounter records behind a timing. A shift by a register holds
 * `base + multiplier * n`, with `n` a range when the count is not a literal.
 */
type CounterLine = {
  timing?: {
    values: Triple[];
    calculation?: { base?: Triple[]; multiplier?: Triple; n?: number | [number, number] };
  };
};

// 68kcounter is CommonJS today. Node's ESM bridge may expose its TS default
// export either directly or under the CommonJS module object's `.default`.
const outerCounter = counterNamespace as unknown as CounterApi;
const cjsCounter =
  outerCounter.default && typeof outerCounter.default === "object"
    ? (outerCounter.default as CounterApi)
    : outerCounter;
const parse68kCounter = (typeof outerCounter.default === "function" ? outerCounter.default : cjsCounter.default) as
  ((source: string) => unknown[]) | undefined;
const calculateCounterTotals = outerCounter.calculateTotals ?? cjsCounter.calculateTotals;

interface Measurement {
  bytes: number;
  cpuCycles?: number;
  readCycles?: number;
  writeCycles?: number;
}

/** Normalize generated snippets to conventional assembler columns before passing
 * them to 68kcounter. Rules intentionally emit compact replacements starting in
 * column zero, while assemblers/parsers may treat that position as a label. */
export function normalizeCounterSnippet(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => (line.trim().length === 0 || /^[ \t]/.test(line) ? line : `\t${line}`))
    .join("\n");
}

/**
 * Total a snippet whose timing depends on a shift count we have proven.
 *
 * A shift by a register is a range only because the count is unknown in
 * general: 68kcounter records it as `base + multiplier * n` over n in 0..63.
 * The rules that reach here fire only when constant propagation has proven the
 * count, so substituting it is the same arithmetic 68kcounter itself does for a
 * literal count, not an estimate.
 *
 * Only a single count-dependent line is resolved. Two would need to be shown to
 * share the one count, and a range with no such calculation behind it -- a
 * conditional branch, whose timing depends on whether it is taken -- is left
 * alone, since no count makes that determinate.
 */
function resolveRangeWithCount(lines: unknown[], count: number): Triple | undefined {
  const timed = (lines as CounterLine[]).filter((line) => line.timing);
  const ranged = timed.filter((line) => Array.isArray(line.timing?.calculation?.n));
  if (ranged.length !== 1) return undefined;

  const total: Triple = [0, 0, 0];
  for (const line of timed) {
    const timing = line.timing!;
    const calculation = timing.calculation;
    let value: Triple | undefined;
    if (Array.isArray(calculation?.n)) {
      const [low, high] = calculation.n;
      const base = calculation.base?.[0];
      const multiplier = calculation.multiplier;
      if (!base || !multiplier || count < low || count > high) return undefined;
      value = [0, 1, 2].map((i) => base[i] + multiplier[i] * count) as Triple;
    } else if (timing.values.length > 1) {
      // A range with no count behind it: a conditional branch, whose timing
      // depends on whether it is taken. No count makes that determinate, and
      // taking the first value would report one path as though it were the
      // measurement.
      return undefined;
    } else {
      value = timing.values[0];
    }
    if (!value) return undefined;
    for (const i of [0, 1, 2]) total[i] += value[i];
  }
  return total;
}

/** Resolves an expression to a constant, using the symbols in scope for the file. */
export type ConstantEvaluator = (expression: ExpressionNode) => number | undefined;

/**
 * The expression on an operand whose width decides how the operand is encoded.
 *
 * Absolute addresses are left out on purpose. Substituting one would change
 * which absolute form is chosen, and a branch target is an address the
 * measurement has no business rewriting.
 */
function sizingExpression(operand: OperandNode): ExpressionNode | undefined {
  const expression =
    operand.type === "immediate"
      ? operand.value
      : "displacement" in operand
        ? (operand.displacement as ExpressionNode | { type: "string-literal" } | undefined)
        : undefined;
  // A string has no value to collapse to, and no bearing on operand width here.
  return expression && expression.type !== "string-literal" ? expression : undefined;
}

/**
 * Replace each operand expression with the constant it evaluates to.
 *
 * 68kcounter reads the written form to decide an addressing mode, and a
 * compound displacement defeats that: `lea SCREEN_BW/2+(SCREEN_H/2*SCREEN_BW)(a3),a3`
 * measures 6 bytes and 12 cycles where `lea 1610(a3),a3` measures 4 and 8. The
 * suggestion keeps the symbols, because that is what a person should paste, but
 * the copy handed to the counter has them collapsed so the two sides are
 * measured on what the assembler will actually encode.
 *
 * A plain number is left alone, and anything that does not evaluate is left as
 * written, so this can only sharpen a measurement, never invent one.
 */
function collapseConstantExpressions(snippet: string, evaluate: ConstantEvaluator | undefined): string {
  if (!evaluate) return snippet;
  return snippet
    .split("\n")
    .map((line) => {
      let parsed;
      try {
        parsed = parseFile(line).lines[0];
      } catch {
        return line;
      }
      const edits: { start: number; end: number; text: string }[] = [];
      for (const operand of parsed?.operands ?? []) {
        const expression = sizingExpression(operand);
        if (!expression || expression.type === "numeric-literal") continue;
        const value = evaluate(expression);
        if (value === undefined) continue;
        edits.push({ start: expression.loc.start, end: expression.loc.end, text: String(value) });
      }
      let out = line;
      for (const edit of edits.sort((a, b) => b.start - a.start)) {
        out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
      }
      return out;
    })
    .join("\n");
}

function measureSnippet(source: string, knownShiftCount?: number): Measurement | undefined {
  try {
    if (!parse68kCounter || !calculateCounterTotals) return undefined;
    const normalized = normalizeCounterSnippet(source);
    const lines = parse68kCounter(normalized);
    const totals = calculateCounterTotals(lines);
    const result: Measurement = { bytes: totals.bytes };

    // A non-empty replacement/source which produces no bytes usually means
    // the counter parser did not understand the snippet. Treat that as an
    // unavailable measurement rather than a miraculous zero-byte encoding.
    if (source.trim() && totals.bytes === 0) return undefined;

    // Conditional branches have min/max timing. The current impact schema is
    // deliberately scalar, so don't pretend one path is "the" exact timing.
    if (!totals.isRange) {
      result.cpuCycles = totals.max[0];
      result.readCycles = totals.max[1];
      result.writeCycles = totals.max[2];
    } else if (knownShiftCount !== undefined) {
      const resolved = resolveRangeWithCount(lines, knownShiftCount);
      if (resolved) {
        result.cpuCycles = resolved[0];
        result.readCycles = resolved[1];
        result.writeCycles = resolved[2];
      }
    }
    return result;
  } catch {
    // 68kcounter is intentionally best-effort here. A lint rule should never
    // disappear merely because the measurement parser doesn't understand a
    // source spelling or expression.
    return undefined;
  }
}

function metric(before: number | undefined, after: number | undefined): OptimizationMetric | undefined {
  if (before === undefined || after === undefined) return undefined;
  return { before, after, delta: after - before, confidence: "exact" };
}

function sourceSpan(diagnostic: Diagnostic, file: ParsedFile): { start: number; end: number } | undefined {
  const lineNumber = diagnostic.loc.line;
  const locationStart = lineNumber ? lineNumber - 1 : undefined;
  let start: number;

  if (locationStart === undefined || locationStart < 0 || locationStart >= file.lines.length) {
    const byIdentity = file.lines.findIndex((line) => line.mnemonic?.loc === diagnostic.loc);
    if (byIdentity < 0) return undefined;
    start = byIdentity;
  } else {
    start = locationStart;
  }

  let end = start;
  for (const [key, value] of Object.entries(diagnostic.data ?? {})) {
    if (
      (key === "sourceStartIndex" || key === "sourceEndIndex" || key.endsWith("InstructionIndex")) &&
      typeof value === "number" &&
      Number.isInteger(value)
    ) {
      if (key === "sourceStartIndex") start = Math.min(start, value);
      else end = Math.max(end, value);
    }
  }
  return { start, end };
}

function preserveSourceClaim(
  existing: OptimizationImpact | undefined,
  rule: ImpactRuleMeta | undefined,
): OptimizationSourceClaim[] | undefined {
  if (!existing) return undefined;
  const size = existing.sizeBytes?.confidence === "source" ? existing.sizeBytes : undefined;
  const execution =
    existing.execution &&
    [existing.execution.cpuCycles, existing.execution.readCycles, existing.execution.writeCycles].some(
      (m) => m?.confidence === "source",
    )
      ? existing.execution
      : undefined;
  const previous = existing.sourceClaims ?? [];
  if (!size && !execution) return previous.length ? previous : undefined;
  return [
    ...previous,
    {
      source: rule?.meta.docs?.source,
      sizeBytes: size,
      execution,
    },
  ];
}

export function assessOptimizationImpact(impact: OptimizationImpact): OptimizationImpact["assessment"] {
  const metrics = [
    impact.sizeBytes,
    impact.execution?.cpuCycles,
    impact.execution?.readCycles,
    impact.execution?.writeCycles,
  ].filter((m): m is OptimizationMetric => !!m && m.confidence === "exact");
  if (!metrics.length) return undefined;
  const hasImprovement = metrics.some((m) => m.delta < 0);
  const hasRegression = metrics.some((m) => m.delta > 0);
  if (hasImprovement && hasRegression) return "tradeoff";
  if (hasRegression) return "regression";
  if (hasImprovement) return "improvement";
  return "neutral";
}

/** Attach exact 68000 resource measurements to a replacement suggestion. */
export function measureDiagnosticImpact(
  diagnostic: Diagnostic,
  file: ParsedFile,
  source: string,
  rule?: ImpactRuleMeta,
  evaluate?: ConstantEvaluator,
): Diagnostic {
  const replacement = diagnostic.suggestion?.replacement;
  if (replacement === undefined) return diagnostic;
  const span = sourceSpan(diagnostic, file);
  if (!span) return diagnostic;

  const sourceLines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const original = sourceLines.slice(span.start, span.end + 1).join("\n");
  // A rule that matched a shift by a register only fires once the count is
  // proven, and records it. Without it the original measures as a range and
  // only the size is comparable, which reported a cycle win as a regression.
  const shiftCount = typeof diagnostic.data?.shiftCount === "number" ? diagnostic.data.shiftCount : undefined;
  const before = measureSnippet(collapseConstantExpressions(original, evaluate), shiftCount);
  const after = measureSnippet(collapseConstantExpressions(replacement, evaluate), shiftCount);
  if (!before || !after) return diagnostic;

  const prior = diagnostic.suggestion!.impact;
  const execution: OptimizationExecutionImpact = {
    processor: "mc68000",
    cpuCycles: metric(before.cpuCycles, after.cpuCycles),
    readCycles: metric(before.readCycles, after.readCycles),
    writeCycles: metric(before.writeCycles, after.writeCycles),
  };
  const impact: OptimizationImpact = {
    ...prior,
    sizeBytes: metric(before.bytes, after.bytes),
    execution,
    sourceClaims: preserveSourceClaim(prior, rule),
  };
  impact.assessment = assessOptimizationImpact(impact);

  const notes = [...(diagnostic.notes ?? [])];
  const sourceSize = prior?.sizeBytes?.confidence === "source" ? prior.sizeBytes : undefined;
  if (sourceSize && impact.sizeBytes && sourceSize.delta !== impact.sizeBytes.delta) {
    notes.push({
      message: `This rule carried an unverified figure of ${sourceSize.delta > 0 ? "+" : ""}${sourceSize.delta} bytes, which the measurement above does not match.`,
    });
  }
  if (impact.assessment === "regression") {
    notes.push({
      message:
        "Measured on 68000 as a resource regression rather than an improvement; check whether it applies to your target.",
    });
  } else if (impact.assessment === "tradeoff") {
    notes.push({ message: "Measured on 68000 as a trade-off rather than an unconditional improvement." });
  }

  return {
    ...diagnostic,
    notes: notes.length ? notes : undefined,
    suggestion: { ...diagnostic.suggestion!, impact },
    data: {
      ...(diagnostic.data ?? {}),
      measuredSourceStartIndex: span.start,
      measuredSourceEndIndex: span.end,
      impactAssessment: impact.assessment,
    },
  };
}
