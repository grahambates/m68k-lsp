import { Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import Parser from "web-tree-sitter";

import { readDocumentFromUri, resolveReferencedUris } from "./files";
import { processSymbols, Symbols } from "./symbols";
import { Context } from "./context";
import { nodeAsRange } from "./geometry";

export interface ProcessedDocument {
  document: TextDocument;
  tree: Parser.Tree;
  symbols: Symbols;
  referencedUris: string[];
  diagnostics: Diagnostic[];
}

export type ProcessedDocumentStore = Map<string, ProcessedDocument>;

export default class DocumentProcessor {
  private parser: Parser;
  private errorsQuery: Parser.Query;

  constructor(protected readonly ctx: Context) {
    this.parser = new Parser();
    this.parser.setLanguage(ctx.language);
    this.errorsQuery = ctx.language.query(`(ERROR) @error`);
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
      diagnostics: this.captureDiagnostics(tree),
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

  private captureDiagnostics(tree: Parser.Tree): Diagnostic[] {
    const captures = this.errorsQuery.captures(tree.rootNode);
    return captures.map(({ node }) => ({
      range: nodeAsRange(node),
      message: "Parser error",
    }));
  }
}
