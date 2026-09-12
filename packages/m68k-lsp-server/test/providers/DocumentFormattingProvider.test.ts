import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { TextDocument } from "vscode-languageserver-textdocument";
import { format } from "m68k-formatter";
import DocumentProcessor from "../../src/DocumentProcessor";
import DocumentFormattingProvider from "../../src/providers/DocumentFormatttingProvider";
import { createTestContext } from "../helpers";

it("shares project config with the library and does not mutate server options", async () => {
  const directory = await mkdtemp(join(tmpdir(), "m68k-lsp-format-"));
  try {
    const config = { align: { indentConditional: 4 } };
    await writeFile(
      join(directory, ".m68k-format.json"),
      JSON.stringify(config),
    );
    const ctx = await createTestContext();
    const before = JSON.stringify(ctx.config.format);
    const provider = new DocumentFormattingProvider(ctx);
    const source = " ifeq 1\n NOP\n endif";
    const document = TextDocument.create(
      pathToFileURL(join(directory, "test.s")).href,
      "vasmmot",
      0,
      source,
    );
    await new DocumentProcessor(ctx).process(document);
    const edits = await provider.onDocumentFormatting({
      textDocument: document,
      options: { tabSize: 8, insertSpaces: true },
    });
    expect(TextDocument.applyEdits(document, edits!)).toBe(
      format(source, config),
    );
    await provider.onDocumentFormatting({
      textDocument: document,
      options: { tabSize: 4, insertSpaces: false },
    });
    expect(JSON.stringify(ctx.config.format)).toBe(before);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
