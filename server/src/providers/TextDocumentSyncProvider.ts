import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import Parser from "web-tree-sitter";

import { Provider } from ".";
import { Context } from "../context";
import DiagnosticProcessor from "../diagnostics";
import DocumentProcessor from "../DocumentProcessor";
import { positionToPoint } from "../geometry";

export default class TextDocumentSyncProvider implements Provider {
  private processor: DocumentProcessor;
  private diagnostics: DiagnosticProcessor;
  private connection: lsp.Connection;

  constructor(protected readonly ctx: Context) {
    this.processor = new DocumentProcessor(ctx);
    this.diagnostics = new DiagnosticProcessor(ctx);
    this.connection = ctx.connection;
  }

  onDidOpenTextDocument({
    textDocument: { uri, languageId, text, version },
  }: lsp.DidOpenTextDocumentParams) {
    const document = TextDocument.create(uri, languageId, version, text);
    this.processor.process(document).then(() => {
      this.fileDiagnostics(uri);
    });
  }

  onDidChangeTextDocument({
    textDocument: { uri, version },
    contentChanges,
  }: lsp.DidChangeTextDocumentParams) {
    const existing = this.ctx.store.get(uri);
    if (!existing) {
      return;
    }
    const { document } = existing;

    // Disable incremental changes in tree-sitter for now
    // Seeing issues in neovim. Order dependent?
    /*
    const allIncremental = contentChanges.every(
      lsp.TextDocumentContentChangeEvent.isIncremental
    );

    if (tree && allIncremental) {
      contentChanges
        .sort(
          (a, b) =>
            b.range.start.line - a.range.start.line ||
            b.range.start.character - a.range.start.character
        )
        .forEach((c) => tree.edit(this.changeToEdit(document, c)));
    }
    */

    const updatedDoc = TextDocument.update(document, contentChanges, version);

    this.processor.process(updatedDoc).then(({ tree }) => {
      // Send just local parser diagnostics - can't get vasm errors until save
      const diagnostics = this.diagnostics.parserDiagnostics(tree);
      this.connection.sendDiagnostics({
        uri,
        diagnostics,
      });
    });
  }

  async onDidSaveTextDocument({
    textDocument: { uri },
  }: lsp.DidSaveTextDocumentParams) {
    this.fileDiagnostics(uri);
  }

  /**
   * Send diagnostics from both local parser and vasm
   */
  async fileDiagnostics(uri: string) {
    const existing = this.ctx.store.get(uri);
    if (!existing) {
      return;
    }
    const vasmDiagnostics = await this.diagnostics.vasmDiagnostics(uri);
    const captureDiagnostics = this.diagnostics.parserDiagnostics(
      existing.tree
    );
    this.connection.sendDiagnostics({
      uri,
      diagnostics: [...captureDiagnostics, ...vasmDiagnostics],
    });
  }

  changeToEdit(
    document: TextDocument,
    change: lsp.TextDocumentContentChangeEvent
  ): Parser.Edit {
    if (!lsp.TextDocumentContentChangeEvent.isIncremental(change)) {
      throw new Error("Not incremental");
    }
    const rangeOffset = document.offsetAt(change.range.start);
    const rangeLength = document.offsetAt(change.range.end) - rangeOffset;
    return {
      startPosition: positionToPoint(change.range.start),
      oldEndPosition: positionToPoint(change.range.end),
      newEndPosition: positionToPoint(
        document.positionAt(rangeOffset + change.text.length)
      ),
      startIndex: rangeOffset,
      oldEndIndex: rangeOffset + rangeLength,
      newEndIndex: rangeOffset + change.text.length,
    };
  }

  register(connection: lsp.Connection): lsp.ServerCapabilities {
    connection.onDidOpenTextDocument(this.onDidOpenTextDocument.bind(this));
    connection.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this));
    connection.onDidSaveTextDocument(this.onDidSaveTextDocument.bind(this));
    return {
      textDocumentSync: lsp.TextDocumentSyncKind.Incremental,
    };
  }
}
