import * as lsp from "vscode-languageserver";
import { Provider } from ".";
import { Context } from "../context";
import DocumentFormatter from "../formatter/DocumentFormatter";

export default class DocumentFormattingProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onDocumentFormatting({
    textDocument,
    options,
  }: lsp.DocumentFormattingParams): Promise<lsp.TextEdit[] | null> {
    const processed = this.ctx.store.get(textDocument.uri);
    if (!processed) {
      return null;
    }
    const formatter = this.getFormatter(options);
    return formatter.format(processed.tree);
  }

  async onDocumentRangeFormatting({
    textDocument,
    options,
    range,
  }: lsp.DocumentRangeFormattingParams): Promise<lsp.TextEdit[] | null> {
    const processed = this.ctx.store.get(textDocument.uri);
    if (!processed) {
      return null;
    }
    const formatter = this.getFormatter(options);
    return formatter.formatRange(processed.tree, range);
  }

  private getFormatter(options: lsp.FormattingOptions): DocumentFormatter {
    // Defaults
    const config = this.ctx.config.format;

    // Override defaults with passed options
    if (options.trimFinalNewlines) {
      config.finalNewLine = false;
    }
    if (options.insertFinalNewline) {
      config.finalNewLine = true;
    }
    if (options.trimTrailingWhitespace !== undefined) {
      config.trimWhitespace = options.trimTrailingWhitespace;
    }
    return new DocumentFormatter(this.ctx.language, config);
  }

  register(connection: lsp.Connection): lsp.ServerCapabilities {
    connection.onDocumentFormatting(this.onDocumentFormatting.bind(this));
    connection.onDocumentRangeFormatting(
      this.onDocumentRangeFormatting.bind(this)
    );
    return {
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
    };
  }
}
