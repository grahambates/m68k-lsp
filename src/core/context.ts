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
    this.diagnostics.push({ ...diagnostic, notes: withProvenance(diagnostic, this.symbols.externalUses()) });
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
