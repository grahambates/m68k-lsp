import * as lsp from "vscode-languageserver";
import { Provider } from ".";
import { Context } from "../context";
import { symbolAtPosition } from "../symbols";

export default class DocumentHighlightProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onDocumentHighlight({
    textDocument,
    position,
  }: lsp.DocumentHighlightParams): Promise<
    lsp.DocumentHighlight[] | undefined
  > {
    const { store: processed } = this.ctx;
    const docSymbols = processed.get(textDocument.uri)?.symbols;
    if (!docSymbols) {
      return;
    }

    // Find reference or definition at position
    const foundSymbol = symbolAtPosition(docSymbols, position);
    if (!foundSymbol) {
      return [];
    }

    const results: lsp.DocumentHighlight[] = [];

    const refs = docSymbols.references.get(foundSymbol.name);
    if (refs) {
      for (const ref of refs) {
        results.push(
          lsp.DocumentHighlight.create(
            ref.location.range,
            lsp.DocumentHighlightKind.Read
          )
        );
      }
    }
    const def = docSymbols.definitions.get(foundSymbol.name);
    if (def) {
      results.push(
        lsp.DocumentHighlight.create(
          def.selectionRange,
          lsp.DocumentHighlightKind.Write
        )
      );
    }

    return results;
  }

  register(connection: lsp.Connection) {
    connection.onDocumentHighlight(this.onDocumentHighlight.bind(this));
    return {
      documentHighlightProvider: true,
    };
  }
}
