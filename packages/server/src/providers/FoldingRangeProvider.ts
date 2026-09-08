import type { ParsedFile } from "m68k-parser";
import * as lsp from "vscode-languageserver";
import { Provider } from ".";
import { Context } from "../context";
import { Definition, DefinitionType } from "../symbols";
import { blockDividers, blockOpeners } from "../syntax";

/**
 * Regions for macro, rept, rem and conditional blocks.
 *
 * A block runs from its opening directive to the line before whatever closes
 * it, and `else`/`elseif` both close the section above and open the next. The
 * tree-sitter grammar produced these as nested body nodes; a line-oriented
 * tree needs the nesting tracked explicitly.
 *
 * Unbalanced blocks are common enough in sources that guard conditionals
 * around includes, so a closer only pops when it matches the innermost open
 * block, and anything left open at the end is discarded.
 */
function blockRegions(parsed: ParsedFile): Array<[number, number]> {
  const regions: Array<[number, number]> = [];
  const open: Array<{ line: number; closers: string[] }> = [];

  for (const [index, line] of parsed.lines.entries()) {
    if (line.mnemonic?.type !== "directive") {
      continue;
    }
    const directive = line.mnemonic.directive.toLowerCase();

    const innermost = open[open.length - 1];
    const closes =
      innermost &&
      (innermost.closers.includes(directive) || blockDividers.has(directive));

    if (closes) {
      const { line: start } = open.pop()!;
      // An empty body has nothing to fold.
      if (index - 1 > start) {
        regions.push([start, index - 1]);
      }
    }

    if (blockOpeners[directive]) {
      open.push({ line: index, closers: blockOpeners[directive] });
    } else if (closes && blockDividers.has(directive)) {
      // `else` reopens with the same terminators as the branch it replaces.
      open.push({ line: index, closers: innermost.closers });
    }
  }

  return regions;
}

export default class FoldingRangeProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onFoldingRanges({
    textDocument,
  }: lsp.FoldingRangeParams): Promise<lsp.FoldingRange[]> {
    const processed = this.ctx.store.get(textDocument.uri);
    if (!processed) {
      return [];
    }

    const folds: lsp.FoldingRange[] = [];

    function addRegion(start: number, end: number) {
      folds.push(
        lsp.FoldingRange.create(start, end, undefined, undefined, "region"),
      );
    }

    for (const [start, end] of blockRegions(processed.parsed)) {
      addRegion(start, end);
    }

    const defs = Array.from(processed?.symbols.definitions.values());
    const labels = defs.filter((def) => def.type === DefinitionType.Label);

    let lastLabel: Definition | undefined;
    let lastLocal: Definition | undefined;

    for (const label of labels) {
      if (lastLocal) {
        const start = lastLocal.location.range.start.line;
        const end = label.location.range.start.line - 1;
        folds.push(lsp.FoldingRange.create(start, end));
        lastLocal = undefined;
      }

      if (lastLabel) {
        const start = lastLabel.location.range.start.line;
        const end = label.location.range.start.line - 1;
        addRegion(start, end);
      }
      lastLabel = label;

      if (label.locals) {
        for (const local of label.locals.values()) {
          if (lastLocal) {
            const start = lastLocal.location.range.start.line;
            const end = local.location.range.start.line - 1;
            addRegion(start, end);
          }
          lastLocal = local;
        }
      }
    }

    const end = processed.document.lineCount;
    if (lastLabel) {
      const start = lastLabel.location.range.start.line;
      addRegion(start, end);
    }
    if (lastLocal) {
      const start = lastLocal.location.range.start.line;
      addRegion(start, end);
    }

    return folds;
  }

  register(connection: lsp.Connection) {
    connection.onFoldingRanges(this.onFoldingRanges.bind(this));
    return {
      foldingRangeProvider: true,
    };
  }
}
