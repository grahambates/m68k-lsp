import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Context } from "../../src/context";
import DocumentProcessor from "../../src/DocumentProcessor";
import DefinitionProvider from "../../src/providers/DefinitionProvider";
import { createTestContext, range } from "../helpers";

describe("DefinitionProvider", () => {
  let provider: DefinitionProvider;
  let ctx: Context;
  let processor: DocumentProcessor;

  beforeAll(async () => {
    ctx = await createTestContext();
    processor = new DocumentProcessor(ctx);
    provider = new DefinitionProvider(ctx);
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
        onDefinition: jest.fn(),
      };
      const capabilities = provider.register(conn as unknown as lsp.Connection);
      expect(conn.onDefinition).toBeCalled();
      expect(capabilities).toHaveProperty("definitionProvider");
    });
  });

  describe("#onDefinition()", () => {
    it("returns a constant definition in same doc", async () => {
      const textDocument = await createDoc(
        "example.s",
        `foo = 123
 move #foo,d0`
      );

      const definitions = await provider.onDefinition({
        position: lsp.Position.create(1, 8),
        textDocument,
      });

      expect(definitions).toHaveLength(1);
      expect(definitions[0].uri).toBe(textDocument.uri);
      expect(definitions[0].range).toEqual(range(0, 0, 0, 9));
    });

    it("returns a definition for a local label", async () => {
      const textDocument = await createDoc(
        "example.s",
        `global:
.local:
 bra .local`
      );

      const definitions = await provider.onDefinition({
        position: lsp.Position.create(2, 8),
        textDocument,
      });

      expect(definitions).toHaveLength(1);
      expect(definitions[0].uri).toBe(textDocument.uri);
      expect(definitions[0].range).toEqual(range(1, 0, 1, 7));
    });

    it("returns a contant definition in included doc", async () => {
      const textDocument = await createDoc(
        "example123.s",
        ` include example.i
 move #foo,d0`
      );

      const definitions = await provider.onDefinition({
        position: lsp.Position.create(1, 8),
        textDocument,
      });

      expect(definitions).toHaveLength(1);
      expect(definitions[0].uri).toMatch(/example.i/);
      expect(definitions[0].range).toEqual(range(1, 0, 1, 9));
    });

    it("returns no definition if not in word", async () => {
      const textDocument = await createDoc("example123.s", ` move #foo,d0`);

      const definitions = await provider.onDefinition({
        position: lsp.Position.create(1, 5),
        textDocument,
      });

      expect(definitions).toHaveLength(0);
    });
  });
});
