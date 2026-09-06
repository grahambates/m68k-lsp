import { parseFile } from "m68k-parser";
import { lintSource } from "../core/lint.js";

/**
 * A replacement adopts the indentation of the code it replaces.
 *
 * Rules emit compact text starting in column zero, which is not valid
 * assembly: a token in column zero is a label, so a multi-line replacement
 * pasted as written defines a label per line and assembles nothing like the
 * intent. This matters for copy and paste today and for applying fixes
 * automatically later.
 */
function replacementFor(source: string, ruleId: string): string | undefined {
  return lintSource(source, { processors: ["mc68000"] }).find((d) => d.ruleId === ruleId)?.suggestion?.replacement;
}

describe("replacements adopt the source indentation", () => {
  test("a single-line replacement is indented like the line it replaces", () => {
    const found = replacementFor("start:\n\tmove.l\t#100,d0\n\trts", "optimization/prefer-moveq");
    expect(found).toBe("\tmoveq #100,d0");
  });

  test("every line of a multi-line replacement is indented, not just the first", () => {
    const found = replacementFor(
      "start:\n\tmuls.w\t#10,d0\n\tmove.l\td1,d2\n\trts",
      "optimization/muls-word-selected-constants",
    );
    expect(found).toBeDefined();
    for (const line of found!.split("\n")) expect(line).toMatch(/^\t\S/);
  });

  test("spaces are matched rather than replaced with a tab", () => {
    const found = replacementFor("start:\n    move.l #100,d0\n    rts", "optimization/prefer-moveq");
    expect(found).toBe("    moveq #100,d0");
  });

  test("an unusual indent width is preserved exactly", () => {
    const found = replacementFor("start:\n      move.l #100,d0\n      rts", "optimization/prefer-moveq");
    expect(found).toBe("      moveq #100,d0");
  });

  // A label occupies column zero, so the instruction's own indentation is the
  // gap between the label and the mnemonic.
  test("a label on the same line does not defeat the indent", () => {
    const found = replacementFor("start:\tmove.l\t#100,d0\n\trts", "optimization/prefer-moveq");
    expect(found).toBe("\tmoveq #100,d0");
  });

  test("a deletion stays empty rather than becoming whitespace", () => {
    const found = replacementFor("\tmove.w #100,d0\n\tmove.w #200,d0\n\trts", "suspicious/dead-register-write");
    expect(found).toBe("");
  });

  test("indented replacements still parse as instructions", () => {
    const found = replacementFor(
      "start:\n\tmuls.w\t#10,d0\n\tmove.l\td1,d2\n\trts",
      "optimization/muls-word-selected-constants",
    );
    // The point of the indentation: parsed on its own, every line is an
    // instruction. Unindented, each would parse as a label instead.
    const parsed = parseFile(found!);
    expect(parsed.lines).toHaveLength(5);
    for (const line of parsed.lines) {
      expect(line.mnemonic?.type).toBe("instruction");
      expect(line.label).toBeUndefined();
    }

    // The same text without indentation is what the parser would have been
    // given before, and it produces labels rather than instructions.
    const unindented = parseFile(found!.replace(/^\t/gm, ""));
    expect(unindented.lines.every((line) => line.mnemonic?.type === "instruction")).toBe(false);
  });
});
