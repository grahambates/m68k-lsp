import * as lsp from "vscode-languageserver";

import { ProcessedDocumentStore } from "./DocumentProcessor";
import { Config, mergeConfig, defaultConfig } from "./config";

export interface Context {
  store: ProcessedDocumentStore;
  workspaceFolders: lsp.WorkspaceFolder[];
  logger: lsp.Logger;
  connection: lsp.Connection;
  config: Config;
}

export async function createContext(
  workspaceFolders: lsp.WorkspaceFolder[],
  logger: lsp.Logger,
  connection: lsp.Connection,
  config: Partial<Config>,
): Promise<Context> {
  return {
    store: new Map(),
    workspaceFolders,
    logger,
    connection,
    config: mergeConfig(config, defaultConfig),
  };
}
