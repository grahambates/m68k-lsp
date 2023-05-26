import * as lsp from "vscode-languageserver";
import Parser from "web-tree-sitter";
import path from "path";

import { ProcessedDocumentStore } from "./DocumentProcessor";
import { Config, mergeConfig, defaultConfig } from "./config";

export interface Context {
  store: ProcessedDocumentStore;
  workspaceFolders: lsp.WorkspaceFolder[];
  language: Parser.Language;
  logger: lsp.Logger;
  connection: lsp.Connection;
  config: Config;
}

let language: Parser.Language;

export async function createContext(
  workspaceFolders: lsp.WorkspaceFolder[],
  logger: lsp.Logger,
  connection: lsp.Connection,
  config: Partial<Config>
): Promise<Context> {
  if (!language) {
    // Workaround for web-tree-sitter node 18 compatibility issue:
    // https://github.com/tree-sitter/tree-sitter/issues/1765#issuecomment-1271790298
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      delete WebAssembly.instantiateStreaming;
    } catch {
      // ¯\_(ツ)_/¯
    }

    await Parser.init();
    language = await Parser.Language.load(
      path.join(__dirname, "..", "wasm", "tree-sitter-m68k.wasm")
    );
  }

  return {
    store: new Map(),
    workspaceFolders,
    language,
    logger,
    connection,
    config: mergeConfig(config, defaultConfig),
  };
}
