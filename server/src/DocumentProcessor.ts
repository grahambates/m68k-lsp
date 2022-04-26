import { Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import Parser from "web-tree-sitter";

import { readDocumentFromUri, resolveReferencedUris } from "./files";
import { processSymbols, Symbols } from "./symbols";
import { Context } from "./context";
import { nodeAsRange } from "./geometry";
import { instructionDocs } from "./docs";

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
  private instructionQuery: Parser.Query;

  constructor(protected readonly ctx: Context) {
    this.parser = new Parser();
    this.parser.setLanguage(ctx.language);
    this.errorsQuery = ctx.language.query(`(ERROR) @error`);
    this.instructionQuery = ctx.language.query(
      `(instruction_mnemonic) @instruction`
    );
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
    const parseErrors = this.errorsQuery
      .captures(tree.rootNode)
      .map(({ node }) => ({
        range: nodeAsRange(node),
        message: "Parser error",
      }));

    const unsupported = this.instructionQuery
      .captures(tree.rootNode)
      .filter(({ node }) => {
        const mnemonic = node.text.toLowerCase();
        const doc = instructionDocs[mnemonic];
        return !this.ctx.config.processors.some((proc) => doc.procs[proc]);
      })
      .map(({ node }) => ({
        range: nodeAsRange(node),
        message: "Unsupported on selected processor(s)",
      }));

    return [...parseErrors, ...unsupported];
  }
}
