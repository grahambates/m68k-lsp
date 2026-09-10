import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";

import { Context } from "../../src/context";
import DocumentProcessor from "../../src/DocumentProcessor";
import DocumentHighlightProvider from "../../src/providers/DocumentHighlightProvider";
import { createTestContext, range } from "../helpers";

describe("DocumentHighlightProvider", () => {
  let provider: DocumentHighlightProvider;
  let ctx: Context;
  let processor: DocumentProcessor;

  beforeAll(async () => {
    ctx = await createTestContext();
    processor = new DocumentProcessor(ctx);
    provider = new DocumentHighlightProvider(ctx);
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
        onDocumentHighlight: jest.fn(),
        onRequest: jest.fn(),
      };
      const capabilities = provider.register(conn as unknown as lsp.Connection);
      expect(conn.onDocumentHighlight).toHaveBeenCalled();
      expect(conn.onRequest).toHaveBeenCalledWith(
        "m68k/registerRanges",
        expect.any(Function),
      );
      expect(conn.onRequest).toHaveBeenCalledWith(
        "m68k/registerUsage",
        expect.any(Function),
      );
      expect(capabilities).toHaveProperty("documentHighlightProvider");
    });
  });

  describe("#onDocumentHighlight()", () => {
    it("highlights definition from usage", async () => {
      const textDocument = await createDoc(
        "example.s",
        `foo = 123
 move #foo,d0`,
      );

      const hightlights = await provider.onDocumentHighlight({
        position: lsp.Position.create(1, 8),
        textDocument,
      });

      expect(hightlights).toHaveLength(2);
      expect(hightlights![0].range).toEqual(range(1, 7, 1, 10));
      expect(hightlights![1].range).toEqual(range(0, 0, 0, 3));
    });
  });

  it("highlights usage from definition", async () => {
    const textDocument = await createDoc(
      "example.s",
      `foo = 123
 move #foo,d0`,
    );

    const hightlights = await provider.onDocumentHighlight({
      position: lsp.Position.create(0, 2),
      textDocument,
    });

    expect(hightlights).toHaveLength(2);
    expect(hightlights![0].range).toEqual(range(1, 7, 1, 10));
    expect(hightlights![1].range).toEqual(range(0, 0, 0, 3));
  });

  it("returns no highlights if not in word", async () => {
    const textDocument = await createDoc("example123.s", ` move #foo,d0`);

    const hightlights = await provider.onDocumentHighlight({
      position: lsp.Position.create(1, 5),
      textDocument,
    });

    expect(hightlights).toHaveLength(0);
  });

  it("highlights numbered and named registers", async () => {
    const textDocument = await createDoc(
      "registers.s",
      ` move d0,(a0,d0.w)
 move D0,d1
 move sr,CCR
 fmove fp0,fpcr
`,
    );

    const cases = [
      { position: [0, 7], length: 3 },
      { position: [0, 11], length: 1 },
      { position: [0, 14], length: 3 },
      { position: [2, 7], length: 1 },
      { position: [2, 11], length: 1 },
      { position: [3, 8], length: 1 },
      { position: [3, 12], length: 1 },
    ];

    for (const { position, length } of cases) {
      const highlights = await provider.onDocumentHighlight({
        position: lsp.Position.create(position[0], position[1]),
        textDocument,
      });

      expect(highlights).toHaveLength(length);
    }
  });

  describe("#onRegisterUsage()", () => {
    it("returns canonical register references within the requested range", async () => {
      const textDocument = await createDoc(
        "usage.s",
        ` move D0,d1
 move (sp),d2
 move d3,d4
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(0, 0, 2, 0),
      });

      expect(result).toEqual({
        documentVersion: 0,
        registers: [
          {
            name: "d0",
            references: [
              {
                range: range(0, 6, 0, 8),
                spelling: "D0",
                kind: "explicit",
                access: "read",
              },
            ],
            read: true,
            written: false,
            input: true,
          },
          {
            name: "d1",
            references: [
              {
                range: range(0, 9, 0, 11),
                spelling: "d1",
                kind: "explicit",
                access: "write",
              },
            ],
            read: false,
            written: true,
            input: false,
          },
          {
            name: "a7",
            references: [
              {
                range: range(1, 7, 1, 9),
                spelling: "sp",
                kind: "explicit",
                access: "read",
              },
            ],
            read: true,
            written: false,
            input: true,
          },
          {
            name: "d2",
            references: [
              {
                range: range(1, 11, 1, 13),
                spelling: "d2",
                kind: "explicit",
                access: "write",
              },
            ],
            read: false,
            written: true,
            input: false,
          },
        ],
      });
    });

    it("expands register lists while preserving their source range", async () => {
      const textDocument = await createDoc(
        "register-list.s",
        " movem.l d0-d2/a1,-(sp)\n",
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(0, 0, 1, 0),
      });

      expect(result?.registers.map(({ name }) => name)).toEqual([
        "d0",
        "d1",
        "d2",
        "a1",
        "a7",
      ]);
      expect(result?.registers[0].references).toEqual([
        {
          range: range(0, 9, 0, 17),
          spelling: "d0-d2/a1",
          kind: "register-list",
          access: "read",
        },
      ]);
    });

    it("classifies direct and addressing-mode register access", async () => {
      const textDocument = await createDoc(
        "access.s",
        ` move.w d0,d1
 add.w d2,d1
 cmp.w d3,d1
 clr.w d4
 move.w (a0)+,d5
 movem.w (a1)+,d6-d7
 mystery d0
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(0, 0, 7, 0),
      });
      const byName = new Map(
        result?.registers.map((usage) => [usage.name, usage]),
      );

      expect(byName.get("d0")?.references.map(({ access }) => access)).toEqual([
        "read",
        "unknown",
      ]);
      expect(byName.get("d1")?.references.map(({ access }) => access)).toEqual([
        "write",
        "readwrite",
        "read",
      ]);
      expect(byName.get("d4")?.references[0].access).toBe("write");
      expect(byName.get("a0")?.references[0].access).toBe("readwrite");
      expect(byName.get("a1")?.references[0].access).toBe("readwrite");
      expect(byName.get("d6")?.references[0].access).toBe("write");
      expect(byName.get("d7")?.references[0].access).toBe("write");
    });

    it("returns undefined for a document without a syntax tree", () => {
      expect(
        provider.onRegisterUsage({
          textDocument: { uri: "file:///missing.s" },
          range: range(0, 0, 1, 0),
        }),
      ).toBeUndefined();
    });
  });
});
