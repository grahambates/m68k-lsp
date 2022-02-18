import { pathToFileURL } from "url";
import * as lsp from "vscode-languageserver";
import { createContext } from "../src/context";

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

export function createTestContext() {
  const workspaceDir = __dirname + "/fixtures";
  const workspaceUri = pathToFileURL(workspaceDir).toString();
  const logger = new NullLogger();

  const connection = {
    sendDiagnostics: jest.fn(),
  } as unknown as lsp.Connection;

  return createContext(
    [{ uri: workspaceUri, name: "fixtures" }],
    logger,
    connection
  );
}

export const range = (
  startLine,
  startChar,
  endLine,
  endChar: number
): lsp.Range => ({
  start: { line: startLine, character: startChar },
  end: { line: endLine, character: endChar },
});
