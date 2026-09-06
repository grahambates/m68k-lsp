import type { ExpressionNode, ParsedFile, ParsedLine } from "m68k-parser";
import { evaluateConstant, type ConstantResult } from "../analysis/constants.js";
import { DefaultSymbolTable, type SymbolTable } from "../analysis/symbols.js";
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
  previousInstruction(index: number): { line: ParsedLine; index: number } | undefined;
  nextInstruction(index: number): { line: ParsedLine; index: number } | undefined;
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
  ) {
    this.sourceLines = source.split(/\r?\n/);
    this.symbols = new DefaultSymbolTable(file);
    this.flags = analyzeFlags(file);
    this.registers = analyzeRegisters(file, (name) => {
      const result = this.symbols.evaluate(name);
      return result.known ? result.value : undefined;
    });
  }

  report(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
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
