import type { OptimizationImpact } from "../core/diagnostic.js";

export function paint(enabled: boolean, code: number, text: string): string {
  return enabled ? `\u001b[${code}m${text}\u001b[0m` : text;
}

/**
 * One number from a measured delta, expressed as a saving: positive is less of
 * the resource than before. Green for a saving, red for a cost.
 */
export function saving(delta: number | undefined, color: boolean): string {
  if (delta === undefined) return "?";
  const saved = -delta;
  return paint(color, saved > 0 ? 32 : saved < 0 ? 31 : 90, `${saved}`);
}

/**
 * Condense a measurement to one line, using the cycles(reads,writes) shape the
 * 68k manuals and 68kcounter use:
 *
 *   saves: 4 bytes, 8(2,0) cycles
 */
export function formatImpact(impact: OptimizationImpact, color: boolean): string | undefined {
  const parts: string[] = [];
  if (impact.sizeBytes) parts.push(`${saving(impact.sizeBytes.delta, color)} bytes`);

  const execution = impact.execution;
  if (execution?.cpuCycles) {
    const reads = saving(execution.readCycles?.delta, color);
    const writes = saving(execution.writeCycles?.delta, color);
    parts.push(`${saving(execution.cpuCycles.delta, color)}(${reads},${writes}) cycles`);
  }
  if (!parts.length) return undefined;

  const confidences = [
    impact.sizeBytes?.confidence,
    execution?.cpuCycles?.confidence,
    execution?.readCycles?.confidence,
    execution?.writeCycles?.confidence,
  ].filter((value): value is NonNullable<typeof value> => value !== undefined);
  const inexact = confidences.find((value) => value !== "exact");

  return `${paint(color, 90, "saves:")} ${parts.join(", ")}${inexact ? ` (${inexact})` : ""}`;
}
