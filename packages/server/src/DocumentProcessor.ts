import { parseFile } from "m68k-parser";
import type { ParsedFile } from "m68k-parser";
import { TextDocument } from "vscode-languageserver-textdocument";

import { readDocumentFromUri, resolveReferencedUris } from "./files";
import { processSymbols, Symbols } from "./symbols";
import { Context } from "./context";

export interface ProcessedDocument {
  document: TextDocument;
  parsed: ParsedFile;
  symbols: Symbols;
  referencedUris: string[];
}

export type ProcessedDocumentStore = Map<string, ProcessedDocument>;

export default class DocumentProcessor {
  constructor(protected readonly ctx: Context) {}

  async process(document: TextDocument): Promise<ProcessedDocument> {
    this.ctx.logger.log("processDocument: " + document.uri);

    const text = document.getText();
    const parsed = parseFile(text);

    const processed: ProcessedDocument = {
      document,
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
