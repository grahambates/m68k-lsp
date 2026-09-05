import type { ExpressionNode, ParsedFile, ParsedLine } from "m68k-parser";
import { getFlagSemantics } from "../semantics/flags.js";
import { canonicalMnemonic } from "../semantics/mnemonics.js";

export interface ControlFlowGraph {
  successors: ReadonlyArray<ReadonlySet<number>>;
  predecessors: ReadonlyArray<ReadonlySet<number>>;
  escapes: ReadonlyArray<boolean>;
}

function symbolFromExpression(expr: ExpressionNode): string | undefined {
  if (expr.type === "symbol") return expr.name.toLowerCase();
  if (expr.type === "group") return symbolFromExpression(expr.expression);
  return undefined;
}

function branchTarget(line: ParsedLine): string | undefined {
  const mnemonic = canonicalMnemonic(line) ?? "";
  const targetIndex = mnemonic.startsWith("db") ? 1 : 0;
  const op = line.operands?.[targetIndex];
  if (!op) return undefined;
  if (op.type === "absolute-address") return symbolFromExpression(op.address);
  if (op.type === "value") return symbolFromExpression(op.value);
  return undefined;
}

function isInstruction(line: ParsedLine | undefined): line is ParsedLine {
  return line?.mnemonic?.type === "instruction";
}

function nextInstructionIndex(file: ParsedFile, index: number): number | undefined {
  for (let i = index + 1; i < file.lines.length; i++) {
    if (isInstruction(file.lines[i])) return i;
  }
  return undefined;
}

export function buildControlFlowGraph(file: ParsedFile): ControlFlowGraph {
  const labels = new Map<string, number>();
  for (let i = 0; i < file.lines.length; i++) {
    const label = file.lines[i]?.label?.label;
    if (!label) continue;
    const target = isInstruction(file.lines[i]) ? i : nextInstructionIndex(file, i);
    if (target !== undefined) labels.set(label.toLowerCase(), target);
  }

  const successors: Set<number>[] = file.lines.map(() => new Set<number>());
  const escapes: boolean[] = file.lines.map(() => false);

  for (let i = 0; i < file.lines.length; i++) {
    const line = file.lines[i];
    if (!isInstruction(line)) continue;

    const semantics = getFlagSemantics(line);
    const fallthrough = nextInstructionIndex(file, i);
    const targetName = branchTarget(line);
    const target = targetName ? labels.get(targetName) : undefined;

    switch (semantics.controlFlow) {
      case "return":
      case "stop":
        escapes[i] = true;
        break;
      case "dynamic-jump":
        // JMP label is statically knowable; JMP (An), indexed jumps, unresolved
        // symbols, etc. are analysis escape points.
        if (target !== undefined) successors[i].add(target);
        else escapes[i] = true;
        break;
      case "call":
        // We do not have an interprocedural summary yet. The call itself is an
        // unknown CCR boundary, but execution can return to the fallthrough.
        if (fallthrough !== undefined) successors[i].add(fallthrough);
        else escapes[i] = true;
        break;
      case "unconditional-branch":
        if (target !== undefined) successors[i].add(target);
        else escapes[i] = true;
        break;
      case "conditional-branch":
        if (target !== undefined) successors[i].add(target);
        else escapes[i] = true;
        if (fallthrough !== undefined) successors[i].add(fallthrough);
        else escapes[i] = true;
        break;
      case "fallthrough":
        if (fallthrough !== undefined) successors[i].add(fallthrough);
        else escapes[i] = true;
        break;
    }
  }

  const predecessors: Set<number>[] = file.lines.map(() => new Set<number>());
  successors.forEach((targets, from) => {
    for (const to of targets) predecessors[to].add(from);
  });

  return { successors, predecessors, escapes };
}
