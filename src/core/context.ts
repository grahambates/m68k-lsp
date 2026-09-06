import type { ExpressionNode, ParsedFile, ParsedLine } from "m68k-parser";
import { evaluateConstant, type ConstantResult } from "../analysis/constants.js";
import { DefaultSymbolTable, type ExternalSymbols, type ExternalUse, type SymbolTable } from "../analysis/symbols.js";
import { analyzeFlags, type FlagAnalysis } from "../analysis/flags.js";
import { analyzeRegisters, type RegisterAnalysis } from "../analysis/registers.js";
import type { LintConfig } from "./config.js";
import type { Diagnostic } from "./diagnostic.js";
import { isMacroInvocation } from "../util/ast.js";

export interface RuleContext {
  readonly file: ParsedFile;
  readonly source: string;
  readonly config: LintConfig;
  readonly symbols: SymbolTable;
  readonly flags: FlagAnalysis;
  readonly registers: RegisterAnalysis;

  report(diagnostic: Diagnostic): void;
  evaluate(expr: ExpressionNode): ConstantResult;
  line(index: number): ParsedLine | undefined;
  sourceLine(index: number): string | undefined;
  /** The exact source text of a parsed node, so replacements can keep what the author wrote. */
  sourceTextOf(node: { loc?: { line?: number; start: number; end: number } } | undefined): string | undefined;
  previousInstruction(index: number): { line: ParsedLine; index: number } | undefined;
  nextInstruction(index: number): { line: ParsedLine; index: number } | undefined;
}

/**
 * Name any constant the diagnostic depended on that came from another file.
 *
 * A value taken from a header the linter merely found, rather than one this
 * file states, is the likeliest thing to be wrong about a report. Saying where
 * it came from turns a confident and otherwise inexplicable diagnostic into one
 * the reader can check.
 */
function withProvenance(diagnostic: Diagnostic, used: readonly ExternalUse[]): Diagnostic["notes"] {
  if (used.length === 0) return diagnostic.notes;
  const listed = used.map(({ name, value, origin }) => `${name} = ${value} (from ${origin})`).join(", ");
  return [...(diagnostic.notes ?? []), { message: `Resolved from outside this file: ${listed}.` }];
}

/**
 * The indentation an instruction on this line sits at.
 *
 * Usually the leading whitespace. Where a label occupies column zero, the gap
 * between the label and the mnemonic is the instruction's own indentation, and
 * is what a replacement should adopt.
 */
function indentOf(sourceLine: string | undefined): string {
  if (sourceLine === undefined) return "\t";
  const leading = /^[ \t]+/.exec(sourceLine)?.[0];
  if (leading) return leading;
  return /^\S+([ \t]+)(?=\S)/.exec(sourceLine)?.[1] ?? "\t";
}

/** Indent every line that does not carry its own indentation already. */
function indentBlock(text: string, indent: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim().length === 0 || /^[ \t]/.test(line) ? line : `${indent}${line}`))
    .join("\n");
}

/**
 * Assumed width of a tab when working out which column something sits in.
 *
 * Only used to count tab stops. Where the source aligns with tabs the
 * replacement is padded with tabs too, so both land on the same stop and the
 * columns agree however wide the reader's tabs actually are.
 */
const TAB_WIDTH = 8;

function columnOf(text: string): number {
  let column = 0;
  for (const char of text) column = char === "\t" ? (Math.floor(column / TAB_WIDTH) + 1) * TAB_WIDTH : column + 1;
  return column;
}

/** How the operands on a line are separated from the mnemonic, and where they start. */
interface OperandAlignment {
  column: number;
  tabs: boolean;
}

/**
 * Where the operands sit on the line a diagnostic points at.
 *
 * Matching the indent alone still leaves a replacement's operands out of line
 * with its neighbours, because rules emit a single space where source almost
 * always uses a tab. Taken from the parsed line rather than by scanning text,
 * so a label or a size qualifier does not confuse the mnemonic's extent.
 */
function operandAlignmentOf(line: ParsedLine | undefined, sourceLine: string | undefined): OperandAlignment | undefined {
  const operandStart = line?.operands?.[0]?.loc.start;
  const mnemonicEnd = line?.qualifier?.loc.end ?? line?.mnemonic?.loc.end;
  if (sourceLine === undefined || operandStart === undefined || mnemonicEnd === undefined) return undefined;
  if (operandStart <= mnemonicEnd) return undefined;

  const separator = sourceLine.slice(mnemonicEnd, operandStart);
  if (separator.trim().length > 0) return undefined;
  // A single space is a separator, not an alignment. Matching a column there
  // would pad a shorter mnemonic out to it and produce `moveq  #100,d0` from
  // source that never lined anything up.
  if (separator === " ") return undefined;
  return { column: columnOf(sourceLine.slice(0, operandStart)), tabs: separator.includes("\t") };
}

/**
 * Pad each line of a replacement so its operands begin in the same column as
 * the operands of the code being replaced.
 *
 * Replacements are generated, so a line is a mnemonic and its operands with
 * nothing else on it; splitting on the first run of whitespace is enough and
 * avoids parsing text this module produced itself.
 */
function alignOperands(text: string, alignment: OperandAlignment): string {
  return text
    .split("\n")
    .map((line) => {
      const parts = /^([ \t]*)(\S+)([ \t]+)(\S.*)$/.exec(line);
      if (!parts) return line;
      const [, indent, mnemonic, , operands] = parts;
      const from = columnOf(`${indent}${mnemonic}`);

      let separator = "";
      if (alignment.tabs) {
        // Tabs only land on stops, so this reaches the source's column exactly
        // when that column is one, and otherwise the first stop past it.
        for (let column = from; column < alignment.column; column = columnOf(`${" ".repeat(column)}\t`)) {
          separator += "\t";
        }
      } else {
        separator = " ".repeat(Math.max(0, alignment.column - from));
      }
      return `${indent}${mnemonic}${separator || (alignment.tabs ? "\t" : " ")}${operands}`;
    })
    .join("\n");
}

export class DefaultRuleContext implements RuleContext {
  private readonly diagnostics: Diagnostic[] = [];
  private readonly sourceLines: string[];
  public readonly symbols: SymbolTable;
  public readonly flags: FlagAnalysis;
  public readonly registers: RegisterAnalysis;

  constructor(
    public readonly file: ParsedFile,
    public readonly source: string,
    public readonly config: LintConfig,
    external?: ExternalSymbols,
  ) {
    this.sourceLines = source.split(/\r?\n/);
    this.symbols = new DefaultSymbolTable(file, external);
    this.flags = analyzeFlags(file);
    this.registers = analyzeRegisters(file, (name) => {
      const result = this.symbols.evaluate(name);
      return result.known ? result.value : undefined;
    });
  }

  report(diagnostic: Diagnostic): void {
    const notes = withProvenance(diagnostic, this.symbols.externalUses());
    const suggestion = this.indentSuggestion(diagnostic);
    this.diagnostics.push({ ...diagnostic, notes, ...(suggestion ? { suggestion } : {}) });
  }

  /**
   * Give a replacement the indentation of the code it replaces.
   *
   * Rules emit compact text starting in column zero, which is not valid
   * assembly: a token in column zero is a label, so a two-line replacement
   * pasted as-is defines two labels and assembles nothing like the intent. The
   * indentation comes from the line the diagnostic is on, so a replacement
   * lands in the column its neighbours use.
   */
  private indentSuggestion(diagnostic: Diagnostic): Diagnostic["suggestion"] {
    const replacement = diagnostic.suggestion?.replacement;
    if (!diagnostic.suggestion || !replacement) return undefined;
    const lineIndex = (diagnostic.loc.line ?? 1) - 1;
    const sourceLine = this.sourceLines[lineIndex];
    const indented = indentBlock(replacement, indentOf(sourceLine));
    const alignment = operandAlignmentOf(this.file.lines[lineIndex], sourceLine);
    const aligned = alignment ? alignOperands(indented, alignment) : indented;
    return { ...diagnostic.suggestion, replacement: aligned };
  }

  /** Drop the record of constants borrowed from other files. Called per line. */
  forgetExternalUses(): void {
    this.symbols.forgetExternalUses();
  }

  evaluate(expr: ExpressionNode): ConstantResult {
    return evaluateConstant(expr, (name) => {
      const result = this.symbols.evaluate(name);
      return result.known ? result.value : undefined;
    });
  }

  line(index: number): ParsedLine | undefined {
    return this.file.lines[index];
  }

  sourceLine(index: number): string | undefined {
    return this.sourceLines[index];
  }

  /**
   * The source text a node was parsed from.
   *
   * Rules that pass a value straight through use this instead of the number it
   * evaluates to, so a replacement for `adda.w #SCREEN_BW/2,a3` reads
   * `lea SCREEN_BW/2(a3),a3` rather than `lea 160(a3),a3`. Substituting the
   * number is a correct instruction and a bad edit: it discards the name that
   * says what the value means, and freezes a number that was meant to follow
   * the constant when it changes.
   */
  sourceTextOf(node: { loc?: { line?: number; start: number; end: number } } | undefined): string | undefined {
    const loc = node?.loc;
    if (!loc || loc.line === undefined) return undefined;
    const text = this.sourceLines[loc.line - 1]?.slice(loc.start, loc.end).trim();
    return text ? text : undefined;
  }

  /**
   * The adjacent instruction, or nothing if a macro invocation comes first.
   *
   * Sequence rules use these to match a run of instructions and then offer a
   * replacement spanning it. A macro invocation between two of them is code
   * that would be deleted by such a replacement, so it has to end the search
   * rather than be stepped over: `prefer-link-sequence` was collapsing a frame
   * setup around an intervening macro call and dropping it.
   */
  previousInstruction(index: number): { line: ParsedLine; index: number } | undefined {
    for (let i = index - 1; i >= 0; i--) {
      const line = this.file.lines[i];
      if (isMacroInvocation(line)) return undefined;
      if (line?.mnemonic?.type === "instruction") return { line, index: i };
    }
    return undefined;
  }

  nextInstruction(index: number): { line: ParsedLine; index: number } | undefined {
    for (let i = index + 1; i < this.file.lines.length; i++) {
      const line = this.file.lines[i];
      if (isMacroInvocation(line)) return undefined;
      if (line?.mnemonic?.type === "instruction") return { line, index: i };
    }
    return undefined;
  }

  getDiagnostics(): readonly Diagnostic[] {
    return this.diagnostics;
  }
}
