import * as lsp from "vscode-languageserver";
import Parser from "web-tree-sitter";
import path from "path";

import { ProcessedDocumentStore } from "./DocumentProcessor";

export interface Context {
  store: ProcessedDocumentStore;
  workspaceFolders: lsp.WorkspaceFolder[];
  language: Parser.Language;
  logger: lsp.Logger;
  connection: lsp.Connection;
}

let language: Parser.Language;

export async function createContext(
  workspaceFolders: lsp.WorkspaceFolder[],
  logger: lsp.Logger,
  connection: lsp.Connection
): Promise<Context> {
  if (!language) {
    await Parser.init();
    language = await Parser.Language.load(
      path.join(__dirname, "..", "tree-sitter-m68k.wasm")
    );
  }

  return {
    store: new Map(),
    workspaceFolders,
    language,
    logger,
    connection,
  };
}
