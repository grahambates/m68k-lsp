import { parseBlocks, parseFile } from "m68k-parser";
import type { BlockStructure, ParsedFile } from "m68k-parser";
import { TextDocument } from "vscode-languageserver-textdocument";

import { readDocumentFromUri, resolveReferencedUris } from "./files";
import { processSymbols, Symbols } from "./symbols";
import { Context } from "./context";

export interface ProcessedDocument {
  document: TextDocument;
  parsed: ParsedFile;
  /** Macro, repeat and conditional nesting derived from `parsed`. */
  blocks: BlockStructure;
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
    const blocks = parseBlocks(parsed);

    const processed: ProcessedDocument = {
      document,
      parsed,
      blocks,
      symbols: processSymbols(document.uri, parsed, blocks, text),
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
