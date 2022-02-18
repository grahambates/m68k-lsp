import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Context } from "../../src/context";
import DocumentProcessor from "../../src/DocumentProcessor";
import FileOperationsProvider from "../../src/providers/FileOperationsProvider";
import { createTestContext } from "../helpers";

describe("FileOperationsProvider", () => {
  let provider: FileOperationsProvider;
  let ctx: Context;
  let processor: DocumentProcessor;

  beforeAll(async () => {
    ctx = await createTestContext();
    processor = new DocumentProcessor(ctx);
    provider = new FileOperationsProvider(ctx);
  });

  // Create and process text doc
  const createDoc = async (filename: string, text: string) => {
    const uri = ctx.workspaceFolders[0].uri + "/" + filename;
    const textDocument = TextDocument.create(uri, "vasmmot", 0, text);
    await processor.process(textDocument);
    return textDocument;
  };

  describe("#register()", () => {
    it("regsiters", () => {
      const conn = {
        workspace: {
          onWillDeleteFiles: jest.fn(),
          onDidDeleteFiles: jest.fn(),
          onDidRenameFiles: jest.fn(),
        },
      };
      const capabilities = provider.register(conn as unknown as lsp.Connection);
      expect(conn.workspace.onWillDeleteFiles).toBeCalled();
      expect(conn.workspace.onDidDeleteFiles).toBeCalled();
      expect(conn.workspace.onDidRenameFiles).toBeCalled();
      expect(capabilities).toHaveProperty("workspace");
    });
  });

  describe("#onDidOpenTextDocument()", () => {
    it("deletes a document from store", async () => {
      const doc = await createDoc("example.s", ` move d0,d1`);

      await provider.onWillDeleteFiles({
        files: [{ uri: doc.uri }],
      });
      await provider.onDidDeleteFiles({
        files: [{ uri: doc.uri }],
      });

      expect(ctx.store.get(doc.uri)).toBeFalsy();
    });

    it("deletes documents in a directory from store", async () => {
      const doc = await createDoc("a/b.s", ` move d0,d1`);
      const dirUri = ctx.workspaceFolders[0].uri + "/a";

      await provider.onWillDeleteFiles({
        files: [{ uri: dirUri }],
      });
      await provider.onDidDeleteFiles({
        files: [{ uri: dirUri }],
      });

      expect(ctx.store.get(doc.uri)).toBeFalsy();
    });

    it("deletes documents in a directory from store", async () => {
      const referencing = await createDoc("example.s", ` include "example.i"`);
      const referenced = ctx.workspaceFolders[0].uri + "/example.i";

      await provider.onWillDeleteFiles({
        files: [{ uri: referenced }],
      });
      await provider.onDidDeleteFiles({
        files: [{ uri: referenced }],
      });

      expect(ctx.store.get(referencing.uri).referencedUris).not.toContain(
        referenced
      );
    });
  });

  describe("#onDidRenameFiles()", () => {
    it("renames a file", async () => {
      const doc = await createDoc("a/b.s", ` move d0,d1`);
      const newUri = doc.uri.replace("a/b.s", "example.s");

      await provider.onDidRenameFiles({
        files: [{ oldUri: doc.uri, newUri }],
      });

      expect(ctx.store.has(doc.uri)).toBeFalsy();
      expect(ctx.store.has(newUri)).toBeTruthy();
    });

    it("renames a directory", async () => {
      const doc = await createDoc("a/b.s", ` move d0,d1`);

      const oldUri = ctx.workspaceFolders[0].uri + "/a";
      const newUri = ctx.workspaceFolders[0].uri + "/b";

      await provider.onDidRenameFiles({
        files: [{ oldUri, newUri }],
      });

      expect(ctx.store.has(doc.uri)).toBeFalsy();
      expect(ctx.store.has(newUri + "/b.s")).toBeTruthy();
    });
  });
});
