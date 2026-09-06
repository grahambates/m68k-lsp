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
    }
  }

  return { region, repeats };
}
