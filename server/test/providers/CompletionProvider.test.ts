import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Context } from "../../src/context";
import DocumentProcessor from "../../src/DocumentProcessor";
import CompletionProvider from "../../src/providers/CompletionProvider";
import { createTestContext } from "../helpers";

describe("CompletionProvider", () => {
  let provider: CompletionProvider;
  let ctx: Context;
  let processor: DocumentProcessor;

  beforeAll(async () => {
    ctx = await createTestContext();
    processor = new DocumentProcessor(ctx);
    provider = new CompletionProvider(ctx);
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
        onCompletion: jest.fn(),
        onCompletionResolve: jest.fn(),
      };
      const capabilities = provider.register(conn as unknown as lsp.Connection);
      expect(conn.onCompletion).toBeCalled();
      expect(conn.onCompletionResolve).toBeCalled();
      expect(capabilities).toHaveProperty("completionProvider");
    });
  });

  describe("#onCompletion()", () => {
    it("completes mnemonics", async () => {
      const textDocument = await createDoc("example.s", "  mov");

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 4),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: "move" })
      );
    });

    it("matches case on mnemonics", async () => {
      const textDocument = await createDoc("example.s", "  MOV");

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 4),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: "MOVE" })
      );
    });

    it("completes sizes", async () => {
      const textDocument = await createDoc("example.s", "  move.");

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 7),
        textDocument,
      });

      expect(completions).toEqual([
        expect.objectContaining({ label: "b" }),
        expect.objectContaining({ label: "w", preselect: true }),
        expect.objectContaining({ label: "l" }),
      ]);
    });

    it("matches case on sizes", async () => {
      const textDocument = await createDoc("example.s", "  MOVE.");

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 7),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: "W" })
      );
    });

    it("completes an operand with registers", async () => {
      const textDocument = await createDoc("example.s", "  move d");

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 8),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: "d0" })
      );
    });

    it("matches case on registers", async () => {
      const textDocument = await createDoc("example.s", "  move D");

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 8),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: "D0" })
      );
    });

    it("completes an operand on first character", async () => {
      const textDocument = await createDoc("example.s", "  move ");

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 7),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: "d0" })
      );
    });

    it("completes an operand with a symbol", async () => {
      const textDocument = await createDoc(
        "example.s",
        `foo = 1
  move f
      `
      );

      const completions = await provider.onCompletion({
        position: lsp.Position.create(1, 8),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: "foo" })
      );
    });

    it("completes local symbols", async () => {
      const textDocument = await createDoc(
        "example.s",
        `global1:
.local1:
global2:
.local2:
  bsr .l
global3:
.local3:
      `
      );

      const completions = await provider.onCompletion({
        position: lsp.Position.create(4, 8),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: ".local2" })
      );
      expect(completions).not.toContainEqual(
        expect.objectContaining({ label: ".local1" })
      );
      expect(completions).not.toContainEqual(
        expect.objectContaining({ label: ".local3" })
      );
    });

    it("doesn't complete labels", async () => {
      const textDocument = await createDoc("example.s", `fo`);

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 2),
        textDocument,
      });

      expect(completions).toHaveLength(0);
    });

    it("doesn't complete on first character of line", async () => {
      const textDocument = await createDoc("example.s", ``);

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, 0),
        textDocument,
      });

      expect(completions).toHaveLength(0);
    });

    it("completes include paths", async () => {
      const line = ` include "ex`;
      const textDocument = await createDoc("example.s", line);

      const completions = await provider.onCompletion({
        position: lsp.Position.create(0, line.length),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({ label: "example.i" })
      );
    });

    it("includes comment documentation before declaration", async () => {
      const textDocument = await createDoc(
        "example.s",
        `; test 123
; example
foo = 123
 move fo`
      );

      const completions = await provider.onCompletion({
        position: lsp.Position.create(2, 9),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({
          documentation: { kind: "markdown", value: "test 123\\nexample" },
        })
      );
    });

    it("includes comment documentation on same line as declaration", async () => {
      const textDocument = await createDoc(
        "example.s",
        `foo = 123 ; example
 move fo`
      );

      const completions = await provider.onCompletion({
        position: lsp.Position.create(1, 8),
        textDocument,
      });

      expect(completions).toContainEqual(
        expect.objectContaining({
          documentation: { kind: "markdown", value: "example" },
        })
      );
    });

    // TODO: signature specific operand competions
  });

  describe("#onCompletionResolve()", () => {
    it("adds documentation", () => {
      const item = provider.onCompletionResolve({
        label: "move",
        data: true,
      });
      expect(item.documentation).toBeTruthy();
      expect(lsp.MarkupContent.is(item.documentation)).toBe(true);
      lsp.MarkupContent.is(item.documentation) &&
        expect(item.documentation.value).toContain("MOVE");
    });
  });
});
