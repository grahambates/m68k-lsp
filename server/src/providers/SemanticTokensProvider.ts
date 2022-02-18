import * as lsp from "vscode-languageserver";
import { resolve } from "path";
import { readFileSync } from "fs";

import { Provider } from ".";
import { uinteger } from "vscode-languageserver";
import { Context } from "../context";

const highlightsPath = resolve(
  require.resolve("tree-sitter-m68k"),
  "..",
  "..",
  "..",
  "queries",
  "highlights.scm"
);
const queriesText = readFileSync(highlightsPath, "utf8");

export default class SemanticTokensProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onSemanticTokens({ textDocument }: lsp.SemanticTokensParams) {
    const { store: processed, language } = this.ctx;
    const tree = processed.get(textDocument.uri)?.tree;
    const data: uinteger[] = [];
    if (!tree) {
      return { data };
    }

    const captures = language.query(queriesText).captures(tree.rootNode);
    for (const { name } of captures) {
      this.ctx.logger.log(name);
      // TODO:
    }

    return { data };
  }

  register(connection: lsp.Connection) {
    connection.onRequest(
      lsp.SemanticTokensRequest.type,
      this.onSemanticTokens.bind(this)
    );
    return {
      semanticTokensProvider: {
        documentSelector: { language: "vasmmot" }, // todo
        legend: {
          tokenTypes: ["number", "keyword"],
          tokenModifiers: [],
        },
        full: true,
      },
    };
  }
}
