import type { ExpressionNode, ParsedFile, ParsedLine } from "m68k-parser";
import { evaluateConstant, type ConstantResult } from "./constants.js";

export interface ConstantSymbol {
  name: string;
  normalizedName: string;
  expression: ExpressionNode;
  line: ParsedLine;
  lineIndex: number;
}

export interface SymbolTable {
  getConstant(name: string): ConstantSymbol | undefined;
  evaluate(name: string): ConstantResult;
  entries(): readonly ConstantSymbol[];
}

function normalizeSymbol(name: string): string {
  // Most 68k assembler source treats symbols case-insensitively. If the
  // parser/toolchain later exposes a case-sensitive mode, make this configurable.
  return name.toLowerCase();
}

function expressionOperand(line: ParsedLine): ExpressionNode | undefined {
  const first = line.operands?.[0];
  if (!first) return undefined;

  switch (first.type) {
    case "value":
      return first.value;
    case "absolute-address":
      return first.address;
    default:
      return undefined;
  }
}

function constantDefinition(line: ParsedLine): { name: string; expression: ExpressionNode } | undefined {
  if (!line.label || line.mnemonic?.type !== "directive") return undefined;

  const directive = line.mnemonic.directive.toLowerCase();
  if (directive !== "equ" && directive !== "=") return undefined;

  const expression = expressionOperand(line);
  if (!expression) return undefined;

  return {
    name: line.label.label,
    expression,
  };
}

export class DefaultSymbolTable implements SymbolTable {
  private readonly constants = new Map<string, ConstantSymbol>();

  constructor(file: ParsedFile) {
    file.lines.forEach((line, lineIndex) => {
      const definition = constantDefinition(line);
      if (!definition) return;

      const normalizedName = normalizeSymbol(definition.name);
      this.constants.set(normalizedName, {
        name: definition.name,
        normalizedName,
        expression: definition.expression,
        line,
        lineIndex,
      });
    });
  }

  getConstant(name: string): ConstantSymbol | undefined {
    return this.constants.get(normalizeSymbol(name));
  }

  evaluate(name: string): ConstantResult {
    return this.evaluateInternal(name, new Set());
  }

  entries(): readonly ConstantSymbol[] {
    return [...this.constants.values()];
  }

  private evaluateInternal(name: string, stack: Set<string>): ConstantResult {
    const normalizedName = normalizeSymbol(name);
    const symbol = this.constants.get(normalizedName);
    if (!symbol) return { known: false, reason: "unknown-symbol" };

    if (stack.has(normalizedName)) {
      return { known: false, reason: "cyclic-symbol" };
    }

    const nextStack = new Set(stack);
    nextStack.add(normalizedName);

    return evaluateConstant(symbol.expression, (referencedName) => {
      const result = this.evaluateInternal(referencedName, nextStack);
      return result.known ? result.value : undefined;
    });
  }
}
