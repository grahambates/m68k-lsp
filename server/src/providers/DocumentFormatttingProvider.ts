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

    // Defaults
    const config = this.ctx.config.format;

    // Override defaults with passed options
    if (config.align) {
      if (options.insertSpaces) {
        const { tabSize, indentStyle } = config.align;
        if (indentStyle === "tab") {
          // Convert tab positions to spaces
          config.align.mnemonic *= tabSize ?? 8;
          config.align.operands *= tabSize ?? 8;
          config.align.comment *= tabSize ?? 8;
        }
        config.align.indentStyle = "space";
      }
      if (options.tabSize) {
        config.align.tabSize = options.tabSize;
      }
    }
    if (options.trimFinalNewlines) {
      config.finalNewLine = false;
    }
    if (options.insertFinalNewline) {
      config.finalNewLine = true;
    }
    if (options.trimTrailingWhitespace !== undefined) {
      config.trimWhitespace = options.trimTrailingWhitespace;
    }

    const formatter = new DocumentFormatter(this.ctx.language, config);

    return formatter.format(processed.tree);
  }

  register(connection: lsp.Connection): lsp.ServerCapabilities {
    connection.onDocumentFormatting(this.onDocumentFormatting.bind(this));
    return {
      documentFormattingProvider: true,
    };
  }
}
