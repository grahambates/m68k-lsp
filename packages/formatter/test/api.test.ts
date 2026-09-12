import { format, formatEdits, defaultOptions } from "../src";
import { applyEdits } from "./helpers";

it("returns equivalent source and edits with shared defaults", () => {
  const source = "foo MOVE.W D0,D1";
  expect(format(source)).toBe("foo:    move.w  d0,d1\n");
  expect(applyEdits(source, formatEdits(source))).toBe(format(source));
  expect(format(format(source))).toBe(format(source));
});

it("merges alignment options without mutating defaults", () => {
  const before = JSON.stringify(defaultOptions);
  expect(
    format(" ifeq 1\n nop\n endif", { align: { indentConditional: 4 } }),
  ).toBe("        ifeq    1\n            nop\n        endif\n");
  expect(JSON.stringify(defaultOptions)).toBe(before);
});

it.each(["", " nop\n", " nop\r\n"])(
  "can remove a final newline from %j",
  (source) => {
    const result = format(source, { finalNewLine: false });
    expect(result.endsWith("\n")).toBe(false);
    expect(format(result, { finalNewLine: false })).toBe(result);
  },
);

it("formats ranges using surrounding block context", () => {
  const source = " ifeq 1\n NOP\n endif";
  const edits = formatEdits(
    source,
    { align: { indentConditional: 4 } },
    {
      start: { line: 1, character: 0 },
      end: { line: 1, character: 100 },
    },
  );
  expect(applyEdits(source, edits)).toBe(" ifeq 1\n            nop\n endif");
});
