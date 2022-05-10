import { TextDocument } from "vscode-languageserver-textdocument";
import Parser from "web-tree-sitter";

import { readDocumentFromUri, resolveReferencedUris } from "./files";
import { processSymbols, Symbols } from "./symbols";
import { Context } from "./context";

export interface ProcessedDocument {
  document: TextDocument;
  tree: Parser.Tree;
  symbols: Symbols;
  referencedUris: string[];
}

export type ProcessedDocumentStore = Map<string, ProcessedDocument>;

export default class DocumentProcessor {
  private parser: Parser;

  constructor(protected readonly ctx: Context) {
    this.parser = new Parser();
    this.parser.setLanguage(ctx.language);
  }

  async process(
    document: TextDocument,
    oldTree?: Parser.Tree
  ): Promise<ProcessedDocument> {
    this.ctx.logger.log("processDocument: " + document.uri);

    const tree = this.parser.parse(document.getText(), oldTree);

    if (oldTree) {
      oldTree.delete();
    }

    const processed: ProcessedDocument = {
      document,
      tree,
      symbols: processSymbols(document.uri, tree, this.ctx),
      referencedUris: [],
    };

    this.ctx.store.set(document.uri, processed);

    const resolved = await resolveReferencedUris(document.uri, this.ctx);
    processed.referencedUris.push(...resolved);

    await Promise.all(
      processed.referencedUris.map(async (uri) => {
        if (!this.ctx.store.has(uri)) {
          const doc = await readDocumentFromUri(uri);
          if (doc) {
            this.process(doc);
          }
        }
      })
    );

    return processed;
  }
}
