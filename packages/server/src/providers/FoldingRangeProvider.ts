import * as lsp from "vscode-languageserver";
import { Query } from "web-tree-sitter";
import { Provider } from ".";
import { Context } from "../context";
import { Definition, DefinitionType } from "../symbols";

let foldQuery: Query | undefined;

export default class FoldingRangeProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onFoldingRanges({
    textDocument,
  }: lsp.FoldingRangeParams): Promise<lsp.FoldingRange[]> {
    const { store: processor, language } = this.ctx;
    const processed = processor.get(textDocument.uri);
    if (!processed) {
      return [];
    }

    if (!foldQuery) {
      foldQuery = language.query(`(element_list) @region`);
    }
    const captures = foldQuery.captures(processed.tree.rootNode);

    const folds: lsp.FoldingRange[] = [];

    function addRegion(start: number, end: number) {
      folds.push(
        lsp.FoldingRange.create(start, end, undefined, undefined, "region")
      );
    }

    captures.forEach(({ node }) =>
      addRegion(node.startPosition.row - 1, node.endPosition.row)
    );

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
