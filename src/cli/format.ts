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

/**
 * Assembly syntax highlighting for terminal output.
 *
 * Deliberately a small tokeniser rather than a reuse of the parser. The lines
 * being coloured are already known to be assembly, mis-colouring is cosmetic
 * rather than harmful, and this has to run over source lines and replacement
 * snippets alike without either having to be a parseable file on its own.
 *
 * Colours never change the visible width of a line, which matters: the caret
 * that underlines a diagnostic is positioned from the uncoloured text, and the
 * escape sequences occupy no columns.
 */
const COLORS = {
  mnemonic: 36,
  size: 34,
  register: 33,
  literal: 35,
  punctuation: 90,
  comment: 90,
} as const;

const REGISTER = /^(?:d[0-7]|a[0-7]|sp|usp|ssp|pc|sr|ccr|fp[0-7])$/i;

/** Numbers in every base an assembler accepts, strings, identifiers, punctuation. */
const OPERAND_TOKEN = /(\$[0-9A-Fa-f]+|%[01]+|@[0-7]+|\d[0-9A-Fa-f]*)|("[^"]*"|'[^']*')|([A-Za-z_.][\w.$]*)|(\s+)|(.)/g;

function highlightOperands(text: string, color: boolean): string {
  return text.replace(OPERAND_TOKEN, (match: string, number: string, string_: string, word: string, space: string) => {
    if (number || string_) return paint(color, COLORS.literal, match);
    if (word) return REGISTER.test(word) ? paint(color, COLORS.register, match) : match;
    if (space) return match;
    return paint(color, COLORS.punctuation, match);
  });
}

/**
 * Colour one line of assembly.
 *
 * The line is read positionally, the way an assembler reads it: anything in
 * column zero is a label, the first word after that is the operation, and a
 * suffix on it is a size. Symbols and labels are left uncoloured so that the
 * names carrying the meaning stay the most readable thing on the line.
 */
export function highlightAsm(text: string, color: boolean): string {
  if (!color || !text.trim()) return text;

  // A whole-line comment: `*` in column zero, or a line that opens with `;`.
  if (/^\s*;/.test(text) || /^\*/.test(text)) return paint(color, COLORS.comment, text);

  // Split off a trailing comment before anything else, so its contents are
  // never mistaken for code.
  const commentAt = findCommentStart(text);
  if (commentAt !== -1) {
    return highlightAsm(text.slice(0, commentAt), color) + paint(color, COLORS.comment, text.slice(commentAt));
  }

  const indent = /^[ \t]*/.exec(text)![0];
  let remainder = text.slice(indent.length);

  // Only column zero holds a label. Matching one on an indented line would take
  // the mnemonic for a label and leave the operation uncoloured.
  let label = "";
  let labelGap = "";
  if (indent.length === 0) {
    const labelMatch = /^([A-Za-z_.][\w.$]*:?)([ \t]*)/.exec(remainder);
    if (labelMatch) {
      [, label, labelGap] = labelMatch;
      remainder = remainder.slice(labelMatch[0].length);
    }
  }

  const operationMatch = /^[A-Za-z_.][\w.$]*/.exec(remainder);
  if (!operationMatch) return `${indent}${label}${labelGap}${highlightOperands(remainder, color)}`;
  const operation = operationMatch[0];
  const rest = remainder.slice(operation.length);

  // A size suffix is coloured apart from the operation it qualifies, but only
  // where it is really a size: `dbf` and `move.l` must not be split the same way.
  const sized = /^(.*?)(\.[bwlsqdxp])$/i.exec(operation);
  const operationText = sized
    ? paint(color, COLORS.mnemonic, sized[1]) + paint(color, COLORS.size, sized[2])
    : paint(color, COLORS.mnemonic, operation);

  return `${indent}${label}${labelGap}${operationText}${highlightOperands(rest, color)}`;
}

/** The `;` that opens a trailing comment, ignoring any inside a string. */
function findCommentStart(text: string): number {
  let quote: string | undefined;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ";") {
      return i;
    }
  }
  return -1;
}
