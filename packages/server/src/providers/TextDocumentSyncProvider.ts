import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Provider } from ".";
import { Context } from "../context";
import DiagnosticProcessor from "../diagnostics";
import DocumentProcessor from "../DocumentProcessor";

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

    const updatedDoc = TextDocument.update(document, contentChanges, version);

    this.processor.process(updatedDoc).then(({ parsed, blocks }) => {
      // Send just local parser diagnostics - can't get vasm errors until save
      const diagnostics = this.diagnostics.parserDiagnostics(parsed, blocks);
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
      existing.parsed,
      existing.blocks,
    );
    this.connection.sendDiagnostics({
      uri,
      diagnostics: [...captureDiagnostics, ...vasmDiagnostics],
    });
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
