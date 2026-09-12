import { parseFile } from "m68k-parser";
import type * as lsp from "vscode-languageserver-types";
import { TextDocument } from "vscode-languageserver-textdocument";
export function applyEdits(src: string, edits: lsp.TextEdit[]) {
  const doc = TextDocument.create("file://", "asm68k", 1, src);
  return TextDocument.applyEdits(doc, edits);
}

/** Build the context a Formatter takes, from source text. */
export function formatContext(src: string) {
  return { parsed: parseFile(src), text: src };
}
