import { parseBlocks, parseFile } from "m68k-parser";
import type { Block, BlockStructure, ParsedFile } from "m68k-parser";
import { TextDocument } from "vscode-languageserver-textdocument";

import { readDocumentFromUri, resolveReferencedUris } from "./files";
import { processSymbols, Symbols } from "./symbols";
import { Context } from "./context";

/**
 * What every file in the workspace contributes to resolution.
 *
 * Symbols and include edges are all that cross file boundaries, and they are
 * cheap to keep: a thousand files cost a few megabytes this way, against a
 * couple of hundred for their syntax trees.
 */
export interface IndexedDocument {
  uri: string;
  symbols: Symbols;
  referencedUris: string[];
  macros: Map<string, MacroDefinition>;
}

export interface MacroDefinition {
  name: string;
  body: string[];
}

/**
 * An open document, with the syntax tree kept alongside its symbols.
 *
 * Everything that needs the tree - formatting, folding, hover, completion -
 * works on the document the request names, which is open by definition.
 */
export interface ProcessedDocument extends IndexedDocument {
  document: TextDocument;
  parsed: ParsedFile;
  /** Macro, repeat and conditional nesting derived from `parsed`. */
  blocks: BlockStructure;
}

export type DocumentStore = Map<string, IndexedDocument>;

/** Backwards-compatible alias for the store type. */
export type ProcessedDocumentStore = DocumentStore;

export function isProcessed(
  doc: IndexedDocument | undefined,
): doc is ProcessedDocument {
  return doc !== undefined && "parsed" in doc;
}

export default class DocumentProcessor {
  constructor(protected readonly ctx: Context) {}

  /**
   * Process an open document, keeping its syntax tree.
   *
   * Files it includes are indexed rather than processed: they are needed for
   * resolution, not for editing, until one of them is opened in its own right.
   */
  async process(document: TextDocument): Promise<ProcessedDocument> {
    this.ctx.logger.log("processDocument: " + document.uri);

    const text = document.getText();
    const parsed = parseFile(text);
    const blocks = parseBlocks(parsed);

    const processed: ProcessedDocument = {
      uri: document.uri,
      document,
      parsed,
      blocks,
      symbols: processSymbols(document.uri, parsed, blocks, text),
      referencedUris: [],
      macros: collectMacroDefinitions(blocks, text),
    };

    this.ctx.store.set(document.uri, processed);

    const resolved = await resolveReferencedUris(document.uri, this.ctx);
    processed.referencedUris.push(...resolved);

    await Promise.all(
      processed.referencedUris.map((uri) => this.indexIfAbsent(uri)),
    );

    return processed;
  }

  /**
   * Read and index a file, keeping only what resolution needs.
   *
   * Returns the existing entry when the file is already open, so indexing
   * never discards a syntax tree that something is using.
   */
  async index(uri: string): Promise<IndexedDocument | undefined> {
    const existing = this.ctx.store.get(uri);
    if (isProcessed(existing)) {
      return existing;
    }

    const document = await readDocumentFromUri(uri);
    // Opening a document while the disk read is pending installs its current
    // text and syntax tree. Never replace that entry with the disk index.
    const current = this.ctx.store.get(uri);
    if (isProcessed(current)) {
      return current;
    }
    if (!document) {
      return undefined;
    }

    const text = document.getText();
    const parsed = parseFile(text);
    const blocks = parseBlocks(parsed);

    const indexed: IndexedDocument = {
      uri,
      symbols: processSymbols(uri, parsed, blocks, text),
      referencedUris: [],
      macros: collectMacroDefinitions(blocks, text),
    };

    this.ctx.store.set(uri, indexed);

    const resolved = await resolveReferencedUris(uri, this.ctx);
    indexed.referencedUris.push(...resolved);

    return indexed;
  }

  /** Index a file and everything it includes, skipping what is already known. */
  private async indexIfAbsent(uri: string): Promise<void> {
    if (this.ctx.store.has(uri)) {
      return;
    }
    const indexed = await this.index(uri);
    if (!indexed) {
      return;
    }
    await Promise.all(
      indexed.referencedUris.map((next) => this.indexIfAbsent(next)),
    );
  }
}

function collectMacroDefinitions(
  structure: BlockStructure,
  text: string,
): Map<string, MacroDefinition> {
  const definitions = new Map<string, MacroDefinition>();
  const lines = text.split(/\r?\n/g);

  const visit = (blocks: Block[]) => {
    for (const block of blocks) {
      if (block.kind === "macro" && block.name && block.end !== undefined) {
        definitions.set(block.name.toLowerCase(), {
          name: block.name,
          body: lines.slice(block.start + 1, block.end),
        });
      }
      visit(block.children);
    }
  };
  visit(structure.blocks);

  return definitions;
}
