import * as files from "../src/files";
import { pathToFileURL } from "url";
import { createTestContext } from "./helpers";
import DocumentProcessor from "../src/DocumentProcessor";
import { TextDocument } from "vscode-languageserver-textdocument";

describe("files", () => {
  describe("#exists()", () => {
    it("returns true if file exists", async () => {
      const exists = files.exists(__dirname + "/fixtures/example.i");
      expect(exists).toBeTruthy();
    });

    it("returns false if file does not exist", async () => {
      const exists = files.exists(__dirname + "/fixtures/non-existent.i");
      expect(exists).toBeTruthy();
    });
  });

  describe("#readDocumentFromUri()", () => {
    it("reads a document", async () => {
      const url = pathToFileURL(__dirname + "/fixtures/example.i").href;
      const doc = await files.readDocumentFromUri(url);
      expect(doc.getText()).toContain("move.w d0,d1");
    });

    it("returns null if file doesn't exist", async () => {
      const url = pathToFileURL(__dirname + "/fixtures/non-existent.i").href;
      const doc = await files.readDocumentFromUri(url);
      expect(doc).toBeNull();
    });
  });

  describe("#isAsmExt()", () => {
    it("returns true for *.s", () => {
      const result = files.isAsmExt("example/foo.s");
      expect(result).toEqual(true);
    });

    it("returns true for *.i", () => {
      const result = files.isAsmExt("example/foo.i");
      expect(result).toEqual(true);
    });

    it("returns false for other extensions", () => {
      const result = files.isAsmExt("example/foo.jpg");
      expect(result).toEqual(false);
    });

    it("returns false for no extension", () => {
      const result = files.isAsmExt("example/foo");
      expect(result).toEqual(false);
    });

    it("is case insensitive", () => {
      const result = files.isAsmExt("example/foo.I");
      expect(result).toEqual(true);
    });
  });

  describe("#getDirectory()", () => {
    it("returns the directory for a file", async () => {
      const result = await files.getDirectory(__dirname + "/fixtures/a/b.s");
      expect(result).toBe(__dirname + "/fixtures/a");
    });

    it("returns the directory for a directory", async () => {
      const result = await files.getDirectory(__dirname + "/fixtures/a");
      expect(result).toBe(__dirname + "/fixtures/a");
    });

    it("returns the directory for non-existent file", async () => {
      const result = await files.getDirectory(
        __dirname + "/fixtures/a/non-existent.s"
      );
      expect(result).toBe(__dirname + "/fixtures/a");
    });
  });

  describe("#resolveInclude()", () => {
    it("resolves an include relative to the current file", async () => {
      const ctx = await createTestContext();
      const result = await files.resolveInclude(
        ctx.workspaceFolders[0].uri + "/example.s",
        "example.i",
        ctx
      );
      expect(result).toBe(__dirname + "/fixtures/example.i");
    });

    it("resolves an include relative to an include dir", async () => {
      const ctx = await createTestContext();
      const processor = new DocumentProcessor(ctx);
      const uri = ctx.workspaceFolders[0].uri + "/example.s";
      await processor.process(
        TextDocument.create(uri, "vasmmot", 1, ` incdir "a"`)
      );

      const result = await files.resolveInclude(uri, "b.s", ctx);
      expect(result).toBe(__dirname + "/fixtures/a/b.s");
    });

    it("resolves an include relative to an include dir in settings", async () => {
      const ctx = await createTestContext({ includePaths: ["a"] });
      const uri = ctx.workspaceFolders[0].uri + "/example.s";
      const result = await files.resolveInclude(uri, "b.s", ctx);
      expect(result).toBe(__dirname + "/fixtures/a/b.s");
    });
  });

  describe("#getDependencies()", () => {
    it("returns referenced and referencing files", async () => {
      const ctx = await createTestContext();
      const processor = new DocumentProcessor(ctx);

      const currentUri = ctx.workspaceFolders[0].uri + "/example.s";
      await processor.process(
        TextDocument.create(currentUri, "vasmmot", 1, ` include "example.i"`)
      );

      const referencingUri = ctx.workspaceFolders[0].uri + "/referencing.s";
      await processor.process(
        TextDocument.create(
          referencingUri,
          "vasmmot",
          1,
          ` include "example.s"`
        )
      );

      const result = await files.getDependencies(currentUri, ctx);

      expect(result).toContain(ctx.workspaceFolders[0].uri + "/example.i");
      expect(result).toContain(ctx.workspaceFolders[0].uri + "/referencing.s");
    });
  });
});
