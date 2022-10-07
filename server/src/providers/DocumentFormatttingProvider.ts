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

  async onDocumentOnTypeFormatting({
    textDocument,
    options,
    position,
    ch,
  }: lsp.DocumentOnTypeFormattingParams) {
    const processed = this.ctx.store.get(textDocument.uri);
    if (!processed) {
      return null;
    }
    const formatter = this.getFormatter({
      ...options,
      // Force trim whitespace off while still typing
      trimTrailingWhitespace: false,
    });
    // Line to format - current or previous if NL
    const line = ch === "\n" ? position.line - 1 : position.line;
    const range = {
      start: { line, character: 0 },
      end: { line: line + 1, character: 0 },
    };
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
    if (!config.align) {
      config.align = {};
    }
    if (options.insertSpaces !== undefined) {
      config.align.indentStyle = options.insertSpaces ? "space" : "tab";
    }
    if (options.tabSize !== undefined) {
      config.align.tabSize = options.tabSize;
    }

    return new DocumentFormatter(this.ctx.language, config);
  }

  register(connection: lsp.Connection): lsp.ServerCapabilities {
    connection.onDocumentFormatting(this.onDocumentFormatting.bind(this));
    connection.onDocumentRangeFormatting(
      this.onDocumentRangeFormatting.bind(this)
    );
    connection.onDocumentOnTypeFormatting(
      this.onDocumentOnTypeFormatting.bind(this)
    );
    return {
      documentFormattingProvider: true,
      documentRangeFormattingProvider: true,
      documentOnTypeFormattingProvider: {
        firstTriggerCharacter: "\n",
        moreTriggerCharacter: [";", " ", "\t", ",", "."],
      },
    };
  }
}
