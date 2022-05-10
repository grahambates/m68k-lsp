import * as lsp from "vscode-languageserver";

import { Context } from "../../src/context";
import TextDocumentSyncProvider from "../../src/providers/TextDocumentSyncProvider";
import { createTestContext, range } from "../helpers";

describe("TextDocumentSyncProvider", () => {
  let provider: TextDocumentSyncProvider;
  let ctx: Context;

  beforeAll(async () => {
    ctx = await createTestContext();
    provider = new TextDocumentSyncProvider(ctx);
  });

  describe("#register()", () => {
    it("regsiters", () => {
      const conn = {
        onDidOpenTextDocument: jest.fn(),
        onDidChangeTextDocument: jest.fn(),
        onDidSaveTextDocument: jest.fn(),
      };
      const capabilities = provider.register(conn as unknown as lsp.Connection);
      expect(conn.onDidOpenTextDocument).toBeCalled();
      expect(conn.onDidChangeTextDocument).toBeCalled();
      expect(capabilities).toHaveProperty("textDocumentSync");
    });
  });

  describe("#onDidOpenTextDocument()", () => {
    it("processes a new document", async () => {
      const uri = "file:///example.s";
      await provider.onDidOpenTextDocument({
        textDocument: {
          uri,
          languageId: "vasmmot",
          version: 1,
          text: " move d0,d1",
        },
      });

      const processed = ctx.store.get(uri);
      expect(processed).toBeTruthy();
      expect(processed.document.getText()).toBe(" move d0,d1");
    });
  });

  describe("#onDidChangeTextDocument()", () => {
    it("processes a change", async () => {
      const uri = "file:///example.s";
      await provider.onDidOpenTextDocument({
        textDocument: {
          uri,
          languageId: "vasmmot",
          version: 1,
          text: " move d0,d1",
        },
      });

      await provider.onDidChangeTextDocument({
        textDocument: {
          uri,
          version: 2,
        },
        contentChanges: [{ range: range(0, 7, 0, 8), text: "2" }],
      });

      const processed = ctx.store.get(uri);
      expect(processed.document.getText()).toBe(" move d2,d1");
    });
  });
});
