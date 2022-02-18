import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Context } from "../../src/context";
import DocumentProcessor from "../../src/DocumentProcessor";
import FoldingRangeProvider from "../../src/providers/FoldingRangeProvider";
import { createTestContext } from "../helpers";

describe("DefinitionProvider", () => {
  let provider: FoldingRangeProvider;
  let ctx: Context;
  let processor: DocumentProcessor;

  beforeAll(async () => {
    ctx = await createTestContext();
    processor = new DocumentProcessor(ctx);
    provider = new FoldingRangeProvider(ctx);
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
        onFoldingRanges: jest.fn(),
      };
      const capabilities = provider.register(conn as unknown as lsp.Connection);
      expect(conn.onFoldingRanges).toBeCalled();
      expect(capabilities).toHaveProperty("foldingRangeProvider");
    });
  });

  describe("#onFoldingRanges()", () => {
    it("folds labels", async () => {
      const textDocument = await createDoc(
        "example.s",
        `example1:
	move d0,d1
	rts
example2:
	add d0,d1
	rts`
      );

      const ranges = await provider.onFoldingRanges({
        textDocument,
      });

      expect(ranges).toHaveLength(2);
      expect(ranges).toContainEqual({
        startLine: 0,
        endLine: 2,
        kind: "region",
      });
      expect(ranges).toContainEqual({
        startLine: 3,
        endLine: 6,
        kind: "region",
      });
    });
  });

  describe("#onFoldingRanges()", () => {
    it("folds local labels", async () => {
      const textDocument = await createDoc(
        "example.s",
        `example1:
	move d0,d1
.l0
	dbf d0,.l0
.l1
	dbf d0,.l1
	rts`
      );

      const ranges = await provider.onFoldingRanges({
        textDocument,
      });

      expect(ranges).toHaveLength(3);
      expect(ranges).toContainEqual({
        startLine: 0,
        endLine: 7,
        kind: "region",
      });
      expect(ranges).toContainEqual({
        startLine: 2,
        endLine: 3,
        kind: "region",
      });
      expect(ranges).toContainEqual({
        startLine: 4,
        endLine: 7,
        kind: "region",
      });
    });

    it("folds element lists", async () => {
      const textDocument = await createDoc(
        "example.s",
        ` ifeq foo
	move d0,d1
	add d0,d1
	endc`
      );

      const ranges = await provider.onFoldingRanges({
        textDocument,
      });

      expect(ranges).toHaveLength(1);
      expect(ranges).toContainEqual({
        startLine: 0,
        endLine: 2,
        kind: "region",
      });
    });
  });
});
