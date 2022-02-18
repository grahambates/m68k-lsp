import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Context } from "../../src/context";
import DocumentProcessor from "../../src/DocumentProcessor";
import HoverProvider from "../../src/providers/HoverProvider";
import { createTestContext, range } from "../helpers";

describe("HoverProvider", () => {
  let provider: HoverProvider;
  let ctx: Context;
  let processor: DocumentProcessor;

  beforeAll(async () => {
    ctx = await createTestContext();
    processor = new DocumentProcessor(ctx);
    provider = new HoverProvider(ctx);
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
        onHover: jest.fn(),
      };
      const capabilities = provider.register(conn as unknown as lsp.Connection);
      expect(conn.onHover).toBeCalled();
      expect(capabilities).toHaveProperty("hoverProvider");
    });
  });

  describe("#onHover()", () => {
    it("provide hover info for symbol reference", async () => {
      const textDocument = await createDoc(
        "example.s",
        `foo = 1
	move #foo,d1`
      );

      const hover = await provider.onHover({
        textDocument,
        position: lsp.Position.create(1, 9),
      });

      expect(hover).toEqual({
        range: range(1, 7, 1, 10),
        contents: [{ language: "vasmmot", value: "foo = 1" }],
      });
    });

    it("provide hover info for instructions", async () => {
      const textDocument = await createDoc("example.s", ` move #foo,d1`);

      const hover = await provider.onHover({
        textDocument,
        position: lsp.Position.create(0, 3),
      });

      expect(hover).toEqual({
        range: range(0, 1, 0, 5),
        contents: {
          kind: "markdown",
          value: expect.stringMatching(
            /Move the contents of the source to the destination location/
          ),
        },
      });
    });

    it("provide hover info for directives", async () => {
      const textDocument = await createDoc("example.s", ` section foo,bss`);

      const hover = await provider.onHover({
        textDocument,
        position: lsp.Position.create(0, 3),
      });

      expect(hover).toEqual({
        range: range(0, 1, 0, 8),
        contents: {
          kind: "markdown",
          value: expect.stringMatching(/Starts a new section/),
        },
      });
    });

    it("provide hover info for size qualifier", async () => {
      const textDocument = await createDoc("example.s", ` move.w d0,d1`);

      const hover = await provider.onHover({
        textDocument,
        position: lsp.Position.create(0, 6),
      });

      expect(hover).toEqual({
        range: range(0, 6, 0, 7),
        contents: {
          kind: "plaintext",
          value: expect.stringMatching(/Word/),
        },
      });
    });

    it("provide hover info for a path", async () => {
      const textDocument = await createDoc("example.s", ` include "example.i"`);

      const hover = await provider.onHover({
        textDocument,
        position: lsp.Position.create(0, 13),
      });

      expect(hover).toEqual({
        range: range(0, 9, 0, 20),
        contents: {
          kind: "markdown",
          value: expect.stringMatching(/example\.i/),
        },
      });
    });

    it("provide hover for literals", async () => {
      const textDocument = await createDoc("example.s", ` move #40,d0`);

      const hover = await provider.onHover({
        textDocument,
        position: lsp.Position.create(0, 7),
      });

      expect(hover).toEqual({
        range: range(0, 7, 0, 9),
        contents: {
          kind: "markdown",
          value: '40 | $28 | %101000 | @50 | "("',
        },
      });
    });
  });
});
