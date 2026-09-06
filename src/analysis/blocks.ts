import type { ParsedFile, ParsedLine } from "m68k-parser";

/**
 * Assembler block structure: which lines belong to a macro definition, and
 * where REPT bodies begin and end.
 *
 * Both change what a line means. Instructions between MACRO and ENDM run
 * wherever the macro is invoked rather than where they are written, so they
 * neither join the flow of the surrounding code nor define file-global
 * constants. A REPT body is assembled more than once, so its last line is
 * followed by its first.
 */
export interface BlockStructure {
  /** Flow region per line. 0 is the file itself; each macro definition gets its own. */
  region: number[];
  /** REPT blocks, as the index of the REPT directive and its matching ENDR. */
  repeats: { start: number; end: number }[];
  /** Conditional assembly blocks, whose arms are alternatives rather than a sequence. */
  conditionals: ConditionalBlock[];
}

/**
 * An IF/ELSE/ENDC block. Exactly one arm is assembled, so the arms are
 * alternatives: the code above the block reaches each of them, and each of them
 * reaches the code below. Running one arm into the next, which is what treating
 * the directives as ordinary skipped lines does, makes a write in the first arm
 * look overwritten by the second.
 */
export interface ConditionalBlock {
  /** The opening IF directive. */
  start: number;
  /** ELSE and ELSEIF directives, in order; each opens a further arm. */
  alternatives: number[];
  /** The closing ENDC or ENDIF. */
  end: number;
}

const CONDITIONAL_ALTERNATIVES = new Set(["else", "elseif"]);
const CONDITIONAL_ENDS = new Set(["endc", "endif"]);

/** Every conditional opener is spelled IF something: IFNE, IFD, IFC and the rest. */
function isConditionalOpener(directive: string): boolean {
  return directive.startsWith("if");
}

export function directiveName(line: ParsedLine | undefined): string | undefined {
  return line?.mnemonic?.type === "directive" ? line.mnemonic.directive.toLowerCase() : undefined;
}

/** Whether a line sits inside a macro definition rather than at file level. */
export function isInMacroDefinition(blocks: BlockStructure, index: number): boolean {
  return (blocks.region[index] ?? 0) !== 0;
}

export function scanBlocks(file: ParsedFile): BlockStructure {
  const region = new Array<number>(file.lines.length).fill(0);
  const repeats: { start: number; end: number }[] = [];
  const repeatStack: number[] = [];
  const conditionals: ConditionalBlock[] = [];
  const conditionalStack: ConditionalBlock[] = [];
  let current = 0;
  let nextRegion = 0;
  let depth = 0;

  for (let i = 0; i < file.lines.length; i++) {
    const directive = directiveName(file.lines[i]);
    if (directive === "macro") {
      if (depth === 0) current = ++nextRegion;
      depth++;
      region[i] = current;
      continue;
    }
    if (directive === "endm") {
      region[i] = current;
      depth = Math.max(0, depth - 1);
      if (depth === 0) current = 0;
      continue;
    }
    region[i] = current;
    if (directive === "rept") repeatStack.push(i);
    else if (directive === "endr") {
      const start = repeatStack.pop();
      if (start !== undefined) repeats.push({ start, end: i });
    } else if (directive && isConditionalOpener(directive)) {
      conditionalStack.push({ start: i, alternatives: [], end: i });
    } else if (directive && CONDITIONAL_ALTERNATIVES.has(directive)) {
      conditionalStack[conditionalStack.length - 1]?.alternatives.push(i);
    } else if (directive && CONDITIONAL_ENDS.has(directive)) {
      const block = conditionalStack.pop();
      if (block) conditionals.push({ ...block, end: i });
    }
  }

  return { region, repeats, conditionals };
}
