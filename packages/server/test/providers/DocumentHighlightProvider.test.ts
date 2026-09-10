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
      expect(conn.onRequest).toHaveBeenCalledWith(
        "m68k/registerSwap",
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

    it("expands textual macro parameters and reparses generated registers", async () => {
      const textDocument = await createDoc(
        "macro-usage.s",
        `Paint macro
 move.w d\\1,d2
 add.w d3,d\\1
 endm
 Paint 4
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(4, 0, 5, 0),
      });
      const byName = new Map(
        result?.registers.map((usage) => [usage.name, usage]),
      );

      expect(byName.get("d4")?.references).toEqual([
        {
          range: range(4, 7, 4, 8),
          spelling: "d4",
          kind: "macro-expansion",
          access: "read",
        },
        {
          range: range(4, 7, 4, 8),
          spelling: "d4",
          kind: "macro-expansion",
          access: "readwrite",
        },
      ]);
      expect(byName.get("d2")?.references[0]).toEqual({
        range: range(4, 1, 4, 6),
        spelling: "d2",
        kind: "macro-expansion",
        access: "write",
      });
      expect(byName.get("d3")?.references[0].access).toBe("read");
    });

    it("preserves argument provenance through nested macro calls", async () => {
      const textDocument = await createDoc(
        "nested-macro.s",
        `Inner macro
 move.w d\\1,d0
 endm
Outer macro
 Inner \\1
 endm
 Outer 5
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(6, 0, 7, 0),
      });
      const d5 = result?.registers.find(({ name }) => name === "d5");

      expect(d5?.references).toEqual([
        {
          range: range(6, 7, 6, 8),
          spelling: "d5",
          kind: "macro-expansion",
          access: "read",
        },
      ]);
    });

    it("does not execute nested calls when selecting a macro definition", async () => {
      const textDocument = await createDoc(
        "macro-definition.s",
        `Inner macro
 move.w d6,d0
 endm
Outer macro
 Inner
 endm
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(3, 0, 6, 0),
      });

      expect(result?.registers).toEqual([]);
    });

    it("classifies direct register arguments from their expanded use only", async () => {
      const textDocument = await createDoc(
        "register-argument.s",
        `Copy macro
 move.w \\1,d0
 endm
 Copy d5
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(3, 0, 4, 0),
      });
      const d5 = result?.registers.find(({ name }) => name === "d5");

      expect(d5).toMatchObject({ read: true, written: false, input: true });
      expect(d5?.references).toEqual([
        {
          range: range(3, 6, 3, 8),
          spelling: "d5",
          kind: "macro-expansion",
          access: "read",
        },
      ]);
    });

    it("expands arguments 10 through 35 using letter parameters", async () => {
      const arguments_ = Array.from({ length: 35 }, (_, index) =>
        index === 9 ? "3" : index === 34 ? "4" : "0",
      ).join(",");
      const textDocument = await createDoc(
        "extended-arguments.s",
        `Extended macro
 move.w d\\a,d\\z
 endm
 Extended ${arguments_}
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(3, 0, 4, 0),
      });

      expect(result?.registers.map(({ name }) => name)).toEqual(["d3", "d4"]);
      expect(result?.registers[0]).toMatchObject({
        read: true,
        written: false,
        input: true,
      });
      expect(result?.registers[1]).toMatchObject({
        read: false,
        written: true,
        input: false,
      });
    });

    it("expands NARG and the argument-count parameter", async () => {
      const textDocument = await createDoc(
        "narg.s",
        `Use macro
 move.w d\\1,d0
 endm
Count macro
 Use NARG
 move.w d0,d\\#
 endm
 Count x,y,z
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(7, 0, 8, 0),
      });
      const d3 = result?.registers.find(({ name }) => name === "d3");

      expect(d3?.references.map(({ access }) => access)).toEqual([
        "read",
        "write",
      ]);
    });

    it("expands qualifier and argument-length parameters", async () => {
      const textDocument = await createDoc(
        "qualifier-query.s",
        `Meta macro
 move.w d\\0,d\\?1
 endm
 Meta.5 abc
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(3, 0, 4, 0),
      });
      const byName = new Map(
        result?.registers.map((usage) => [usage.name, usage]),
      );

      expect(byName.get("d5")?.references[0]).toMatchObject({
        range: range(3, 6, 3, 7),
        spelling: "d5",
        access: "read",
      });
      expect(byName.get("d3")?.references[0]).toMatchObject({
        spelling: "d3",
        access: "write",
      });
    });

    it("tracks CARG selectors and mutation across a macro body", async () => {
      const textDocument = await createDoc(
        "carg.s",
        `Use macro
 move.w d\\1,d0
 endm
Select macro
 move.w d\\.,d0
 move.w d\\+,d0
 Use CARG
 move.w d\\.,d0
 move.w d\\-,d0
 move.w d\\.,d0
 endm
 Select 2,3
`,
      );

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(11, 0, 12, 0),
      });
      const byName = new Map(
        result?.registers.map((usage) => [usage.name, usage]),
      );

      expect(byName.get("d2")?.references).toHaveLength(4);
      expect(byName.get("d3")?.references).toHaveLength(2);
    });

    it("resolves macro definitions from included unit documents", async () => {
      const macroDocument = await createDoc(
        "macros.i",
        `Paint macro
 move.w d\\1,d0
 endm
`,
      );
      const textDocument = await createDoc("macro-caller.s", " Paint 6\n");
      ctx.store.get(textDocument.uri)!.referencedUris.push(macroDocument.uri);

      const result = provider.onRegisterUsage({
        textDocument,
        range: range(0, 0, 1, 0),
      });

      expect(result?.registers.map(({ name }) => name)).toEqual(["d6", "d0"]);
    });

    it("stops recursive macro expansion", async () => {
      const textDocument = await createDoc(
        "recursive-macro.s",
        `Forever macro
 Forever \\1
 endm
 Forever 1
`,
      );

      expect(
        provider.onRegisterUsage({
          textDocument,
          range: range(3, 0, 4, 0),
        }),
      ).toEqual({ documentVersion: 0, registers: [] });
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

  describe("#onRegisterSwap()", () => {
    it("plans both directions atomically and preserves token case", async () => {
      const textDocument = await createDoc(
        "swap.s",
        ` move.w D0,d1
 add.w d1,D0
`,
      );

      const result = provider.onRegisterSwap({
        textDocument,
        documentVersion: 0,
        range: range(0, 0, 2, 0),
        registers: ["d0", "d1"],
      });

      expect(result).toEqual({
        documentVersion: 0,
        edits: [
          { range: range(0, 8, 0, 10), newText: "D1" },
          { range: range(1, 10, 1, 12), newText: "D1" },
          { range: range(0, 11, 0, 13), newText: "d0" },
          { range: range(1, 7, 1, 9), newText: "d0" },
        ],
      });
    });

    it("treats SP as A7 when swapping address registers", async () => {
      const textDocument = await createDoc("swap-sp.s", " move SP,a0\n");

      const result = provider.onRegisterSwap({
        textDocument,
        documentVersion: 0,
        range: range(0, 0, 1, 0),
        registers: ["a7", "a0"],
      });

      expect(result?.edits).toEqual([
        { range: range(0, 6, 0, 8), newText: "A0" },
        { range: range(0, 9, 0, 11), newText: "a7" },
      ]);
    });

    it("allows an unused destination register", async () => {
      const textDocument = await createDoc(
        "unused-swap.s",
        " move d0,d1\n add d0,d1\n",
      );

      const result = provider.onRegisterSwap({
        textDocument,
        documentVersion: 0,
        range: range(0, 0, 2, 0),
        registers: ["d0", "d2"],
      });

      expect(result).toEqual({
        documentVersion: 0,
        edits: [
          { range: range(0, 6, 0, 8), newText: "d2" },
          { range: range(1, 5, 1, 7), newText: "d2" },
        ],
      });
    });

    it("rejects stale document versions", async () => {
      const textDocument = await createDoc("stale-swap.s", " move d0,d1\n");

      expect(
        provider.onRegisterSwap({
          textDocument,
          documentVersion: 1,
          range: range(0, 0, 1, 0),
          registers: ["d0", "d1"],
        }),
      ).toMatchObject({ edits: [], error: "stale-document" });
    });

    it("rejects identical or invalid registers", async () => {
      const textDocument = await createDoc("invalid-swap.s", " move d0,d1\n");

      expect(
        provider.onRegisterSwap({
          textDocument,
          documentVersion: 0,
          range: range(0, 0, 1, 0),
          registers: ["d0", "d0"],
        }),
      ).toMatchObject({ edits: [], error: "invalid-registers" });
    });

    it("returns no partial edits for register lists", async () => {
      const textDocument = await createDoc(
        "list-swap.s",
        " movem.l d0-d1,-(sp)\n",
      );

      const result = provider.onRegisterSwap({
        textDocument,
        documentVersion: 0,
        range: range(0, 0, 1, 0),
        registers: ["d0", "d1"],
      });

      expect(result).toMatchObject({
        edits: [],
        error: "unsupported-reference",
      });
      expect(result?.unsupported).toHaveLength(2);
    });

    it("returns no partial edits for macro-generated references", async () => {
      const textDocument = await createDoc(
        "macro-swap.s",
        `Copy macro
 move.w d\\1,d0
 endm
 Copy 1
`,
      );

      const result = provider.onRegisterSwap({
        textDocument,
        documentVersion: 0,
        range: range(3, 0, 4, 0),
        registers: ["d0", "d1"],
      });

      expect(result).toMatchObject({
        edits: [],
        error: "unsupported-reference",
      });
      expect(result?.unsupported).toHaveLength(2);
    });
  });
});
