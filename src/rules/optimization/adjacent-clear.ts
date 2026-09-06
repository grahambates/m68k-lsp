import type { OperandNode } from "m68k-parser";
import type { Rule } from "../../core/rule.js";
import { instructionSize, isInstruction, operand } from "../../util/ast.js";
import { sourceOperand } from "./helpers.js";

function absoluteNumeric(ctx: Parameters<NonNullable<Rule["checkLine"]>>[0], op: unknown): number | undefined {
  const value = op as OperandNode | undefined;
  if (!value || value.type !== "absolute-address") return undefined;
  const result = ctx.evaluate(value.address);
  return result.known ? result.value : undefined;
}

function hasInterveningLabel(ctx: Parameters<NonNullable<Rule["checkLine"]>>[0], from: number, to: number): boolean {
  for (let i = from + 1; i <= to; i++) if (ctx.line(i)?.label) return true;
  return false;
}

function clearPair(fromSize: "b" | "w", toSize: "w" | "l", delta: number, id: string): Rule {
  return {
    meta: {
      id,
      category: "optimization",
      defaultSeverity: "suggestion",
      description: `Combine adjacent CLR.${fromSize.toUpperCase()} writes`,
      tags: ["asp68k", "peephole", "memory", "size"],
      docs: { source: "ASP68K" },
    },
    checkLine(ctx, line, index) {
      if (!isInstruction(line, "clr") || instructionSize(line) !== fromSize) return;
      const first = operand(line, 0);
      const a = absoluteNumeric(ctx, first);
      if (a === undefined) return;
      const next = ctx.nextInstruction(index);
      if (
        !next ||
        hasInterveningLabel(ctx, index, next.index) ||
        !isInstruction(next.line, "clr") ||
        instructionSize(next.line) !== fromSize
      )
        return;
      const b = absoluteNumeric(ctx, operand(next.line, 0));
      if (b !== a + delta) return;
      const rendered = sourceOperand(ctx, line, 0);
      if (!rendered) return;

      ctx.report({
        ruleId: id,
        category: "optimization",
        severity: "suggestion",
        confidence: "high",
        message: `Adjacent CLR.${fromSize.toUpperCase()} writes can be combined into CLR.${toSize.toUpperCase()}`,
        loc: line.mnemonic!.loc,
        suggestion: {
          description: `Use CLR.${toSize} ${rendered}`,
          replacement: `clr.${toSize} ${rendered}`,
          applicability: "manual",
        },
        notes: [
          { message: "The two addresses are adjacent, so one wider access covers both." },
          {
            message:
              "Manual review required: combining bus accesses can change behaviour for memory-mapped I/O, device registers, or fault boundaries.",
          },
        ],
        data: { secondInstructionIndex: next.index },
      });
    },
  };
}

export const combineAdjacentClrBytes = clearPair("b", "w", 1, "optimization/combine-adjacent-clr-bytes");
export const combineAdjacentClrWords = clearPair("w", "l", 2, "optimization/combine-adjacent-clr-words");
