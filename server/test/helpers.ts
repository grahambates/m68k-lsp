import { pathToFileURL } from "url";
import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import Parser from "web-tree-sitter";
import path from "path";

import { createContext } from "../src/context";
import { Config } from "../src/config";

export class NullLogger implements lsp.Logger {
  info() {
    return null;
  }
  warn() {
    return null;
  }
  error() {
    return null;
  }
  log() {
    return null;
  }
}

export function createTestContext(config: Partial<Config> = {}) {
  const workspaceDir = path.join(__dirname, "fixtures");
  const workspaceUri = pathToFileURL(workspaceDir).toString();
  const logger = new NullLogger();

  const connection = {
    sendDiagnostics: jest.fn(),
  } as unknown as lsp.Connection;

  return createContext(
    [{ uri: workspaceUri, name: "fixtures" }],
    logger,
    connection,
    config
  );
}

export const range = (
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number
): lsp.Range => ({
  start: { line: startLine, character: startChar },
  end: { line: endLine, character: endChar },
});

export async function parseTree(src: string) {
  await Parser.init();
  const language = await Parser.Language.load(
    path.join(__dirname, "..", "wasm", "tree-sitter-m68k.wasm")
  );
  const parser = new Parser();
  parser.setLanguage(language);

  return { tree: parser.parse(src), language };
}

export function applyEdits(src: string, edits: lsp.TextEdit[]) {
  const doc = TextDocument.create("file://", "asm68k", 1, src);
  return TextDocument.applyEdits(doc, edits);
}
