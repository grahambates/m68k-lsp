import { parseFile } from "m68k-parser";
import type { ParsedFile } from "m68k-parser";
import { TextDocument } from "vscode-languageserver-textdocument";
import Parser from "web-tree-sitter";

import { readDocumentFromUri, resolveReferencedUris } from "./files";
import { processSymbols, Symbols } from "./symbols";
import { Context } from "./context";

export interface ProcessedDocument {
  document: TextDocument;
  tree: Parser.Tree;
  /**
   * m68k-parser syntax tree for the same text.
   *
   * Maintained alongside the tree-sitter tree while consumers move across to
   * it; `tree` goes away once nothing reads it any more.
   */
  parsed: ParsedFile;
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
    oldTree?: Parser.Tree,
  ): Promise<ProcessedDocument> {
    this.ctx.logger.log("processDocument: " + document.uri);

    const text = document.getText();
    const tree = this.parser.parse(text, oldTree);
    const parsed = parseFile(text);

    if (oldTree) {
      oldTree.delete();
    }

    const processed: ProcessedDocument = {
      document,
      tree,
      parsed,
      symbols: processSymbols(document.uri, parsed, text),
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
      }),
    );

    return processed;
  }
}
