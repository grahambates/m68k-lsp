import type { ExpressionNode, ParsedFile, ParsedLine } from "m68k-parser";
import { getFlagSemantics } from "../semantics/flags.js";
import { canonicalMnemonic } from "../semantics/mnemonics.js";
import { isExecutableLine } from "../util/ast.js";
import { scanBlocks } from "./blocks.js";

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

/**
 * Macro invocations are nodes like any other. They stand in for instructions
 * the assembler will emit here, so flow must pass through them rather than
 * around them.
 */
function isExecutable(line: ParsedLine | undefined): line is ParsedLine {
  return isExecutableLine(line);
}

export function buildControlFlowGraph(file: ParsedFile): ControlFlowGraph {
  const { region, repeats: repeatBlocks } = scanBlocks(file);

  // Convert each REPT's directive bounds into the executable lines it encloses.
  const repeats: { first: number; last: number }[] = [];
  for (const { start, end } of repeatBlocks) {
    let head: number | undefined;
    let tail: number | undefined;
    for (let i = start + 1; i < end; i++) {
      if (!isExecutable(file.lines[i])) continue;
      head ??= i;
      tail = i;
    }
    if (head !== undefined && tail !== undefined && head !== tail) repeats.push({ first: head, last: tail });
  }

  /**
   * The next executable line in the same region. Lines belonging to another
   * region are stepped over rather than stopped at, because a macro definition
   * occupies source without emitting code: the instruction above one falls
   * through to the instruction below it. A line inside a definition finds
   * nothing past ENDM, which is what ends that region's flow.
   */
  const nextExecutableIndex = (index: number): number | undefined => {
    for (let i = index + 1; i < file.lines.length; i++) {
      if (region[i] !== region[index]) continue;
      if (isExecutable(file.lines[i])) return i;
    }
    return undefined;
  };

  // Labels are resolved within a region, so a branch inside a macro body cannot
  // land in the file and vice versa.
  const labels = new Map<string, number>();
  for (let i = 0; i < file.lines.length; i++) {
    const label = file.lines[i]?.label?.label;
    if (!label) continue;
    const target = isExecutable(file.lines[i]) ? i : nextExecutableIndex(i);
    if (target !== undefined) labels.set(`${region[i]}:${label.toLowerCase()}`, target);
  }

  const successors: Set<number>[] = file.lines.map(() => new Set<number>());
  const escapes: boolean[] = file.lines.map(() => false);

  for (let i = 0; i < file.lines.length; i++) {
    const line = file.lines[i];
    if (!isExecutable(line)) continue;

    const semantics = getFlagSemantics(line);
    const fallthrough = nextExecutableIndex(i);
    const targetName = branchTarget(line);
    const target = targetName ? labels.get(`${region[i]}:${targetName}`) : undefined;

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

  // The last line of a REPT body is followed by the first, so a value written
  // late in the body and read early in it stays live across the iteration.
  for (const { first, last } of repeats) {
    if (isExecutable(file.lines[last])) successors[last].add(first);
  }

  // A macro body's last line has nowhere to fall through to, since the region
  // ends there. Its exit state is whatever the caller does next, which is not
  // knowable here, so it escapes rather than being treated as the end of the
  // program (which would make every register look dead).
  for (let i = 0; i < file.lines.length; i++) {
    if (region[i] === 0 || !isExecutable(file.lines[i])) continue;
    if (successors[i].size === 0) escapes[i] = true;
  }

  const predecessors: Set<number>[] = file.lines.map(() => new Set<number>());
  successors.forEach((targets, from) => {
    for (const to of targets) predecessors[to].add(from);
  });

  return { successors, predecessors, escapes };
}
