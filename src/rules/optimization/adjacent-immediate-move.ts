import type { OperandNode } from "m68k-parser";
import type { Rule } from "../../core/rule.js";
import { immediateOperand, instructionSize, isInstruction, operand } from "../../util/ast.js";
import { sourceOperand } from "./helpers.js";

function absoluteNumeric(ctx: Parameters<NonNullable<Rule["checkLine"]>>[0], op: unknown): number | undefined {
  const value = op as OperandNode | undefined;
  if (!value || value.type !== "absolute-address") return undefined;
  const result = ctx.evaluate(value.address);
  return result.known ? result.value : undefined;
}

function immediate(
  ctx: Parameters<NonNullable<Rule["checkLine"]>>[0],
  line: Parameters<NonNullable<Rule["checkLine"]>>[1],
): number | undefined {
  const op = immediateOperand(line, 0);
  if (!op || op.value.type === "string-literal") return undefined;
  const result = ctx.evaluate(op.value);
  return result.known ? result.value : undefined;
}

function hasInterveningLabel(ctx: Parameters<NonNullable<Rule["checkLine"]>>[0], from: number, to: number): boolean {
  for (let i = from + 1; i <= to; i++) if (ctx.line(i)?.label) return true;
  return false;
}

function movePair(
  fromSize: "b" | "w",
  toSize: "w" | "l",
  delta: number,
  mask: number,
  shift: number,
  id: string,
): Rule {
  return {
    meta: {
      id,
      category: "optimization",
      defaultSeverity: "suggestion",
      description: `Combine adjacent MOVE.${fromSize.toUpperCase()} immediate stores`,
      tags: ["asp68k", "peephole", "memory"],
      docs: { source: "ASP68K" },
    },
    checkLine(ctx, line, index) {
      if (!isInstruction(line, "move") || instructionSize(line) !== fromSize) return;
      const a = absoluteNumeric(ctx, operand(line, 1));
      const x = immediate(ctx, line);
      if (a === undefined || x === undefined) return;
      const next = ctx.nextInstruction(index);
      if (
        !next ||
        hasInterveningLabel(ctx, index, next.index) ||
        !isInstruction(next.line, "move") ||
        instructionSize(next.line) !== fromSize
      )
        return;
      const b = absoluteNumeric(ctx, operand(next.line, 1));
      const y = immediate(ctx, next.line);
      if (b !== a + delta || y === undefined) return;
      const dest = sourceOperand(ctx, line, 1);
      if (!dest) return;
      const combined = ((x & mask) * 2 ** shift + (y & mask)) >>> 0;
      const hexWidth = toSize === "w" ? 4 : 8;
      const literal = `$${combined.toString(16).padStart(hexWidth, "0")}`;

      ctx.report({
        ruleId: id,
        category: "optimization",
        severity: "suggestion",
        confidence: "high",
        message: `Adjacent immediate MOVE.${fromSize.toUpperCase()} stores can be combined into MOVE.${toSize.toUpperCase()}`,
        loc: line.mnemonic!.loc,
        suggestion: {
          description: `Use MOVE.${toSize} #${literal},${dest}`,
          replacement: `move.${toSize} #${literal},${dest}`,
          applicability: "conditional",
        },
        notes: [
          {
            message:
              "The two addresses are adjacent, so one wider store covers both. 68k byte order places the first value in the high-order part.",
          },
          {
            message:
              "Manual review required: wider memory accesses can change behaviour for memory-mapped I/O, device registers, or fault boundaries.",
          },
        ],
        data: { secondInstructionIndex: next.index, combinedValue: combined },
      });
    },
  };
}

export const combineAdjacentMoveBytes = movePair("b", "w", 1, 0xff, 8, "optimization/combine-adjacent-move-bytes");
export const combineAdjacentMoveWords = movePair("w", "l", 2, 0xffff, 16, "optimization/combine-adjacent-move-words");
