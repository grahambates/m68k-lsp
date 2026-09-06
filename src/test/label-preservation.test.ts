import { lintSource } from "../core/lint.js";

/**
 * A replacement stands in for whole lines, so applying one destroys everything
 * on them that is not the instruction. A label is the case that breaks a build
 * rather than merely losing information: `start: move.l #100,d0` becoming
 * `moveq #100,d0` was a `safe` suggestion that deleted `start:` and with it
 * every branch to it.
 *
 * A label on the first line still points at the same instruction, so it is
 * carried across. One further into the run has nowhere to go once the run
 * collapses, so there is no rewrite to offer.
 */
const suggestion = (lines: string[], ruleId: string) =>
  lintSource(lines.join("\n"), { processors: ["mc68000"] }).find((d) => d.ruleId === ruleId)?.suggestion;

describe("a label on the first line is kept", () => {
  test("through a one-for-one replacement", () => {
    expect(suggestion(["start:\tmove.l\t#100,d0", "\trts"], "optimization/prefer-moveq")?.replacement).toBe(
      "start:\tmoveq\t#100,d0",
    );
  });

  test("on the first line of a multi-line replacement", () => {
    const found = suggestion(
      ["start:\tmuls.w\t#10,d0", "\tmove.l\td1,d2", "\trts"],
      "optimization/muls-word-selected-constants",
    );
    expect(found?.replacement?.split("\n")[0]).toBe("start:\text.l\td0");
  });

  // Deleting the instruction still leaves somewhere to branch to.
  test("when the instruction is deleted outright", () => {
    const found = suggestion(
      ["start:\tmove.w\t#100,d0", "\tmove.w\t#200,d0", "\tmove.l\td0,(a0)", "\trts"],
      "suspicious/dead-register-write",
    );
    expect(found?.replacement).toBe("start:");
    expect(found?.applicability).toBe("safe");
  });

  test("a label on its own line above is outside the match and untouched", () => {
    expect(suggestion(["start:", "\tmove.l\t#100,d0", "\trts"], "optimization/prefer-moveq")?.replacement).toBe(
      "\tmoveq\t#100,d0",
    );
  });
});

describe("a label further into the match leaves nothing to offer", () => {
  const LINK = "optimization/prefer-link-sequence";

  test("sharing a line with an interior instruction", () => {
    const found = suggestion(
      ["\tmove.l\ta6,-(sp)", ".ret:\tmove.l\tsp,a6", "\tadd.w\t#-32,sp", "\tmoveq\t#0,d0", "\trts"],
      LINK,
    );
    expect(found?.replacement).toBeUndefined();
    expect(found?.applicability).toBe("manual");
  });

  test("on its own line inside the match", () => {
    const found = suggestion(
      ["\tmove.l\ta6,-(sp)", ".ret:", "\tmove.l\tsp,a6", "\tadd.w\t#-32,sp", "\tmoveq\t#0,d0", "\trts"],
      LINK,
    );
    expect(found?.replacement).toBeUndefined();
    expect(found?.applicability).toBe("manual");
  });

  test("the same match without a label is still offered", () => {
    const found = suggestion(
      ["\tmove.l\ta6,-(sp)", "\tmove.l\tsp,a6", "\tadd.w\t#-32,sp", "\tmoveq\t#0,d0", "\trts"],
      LINK,
    );
    expect(found?.replacement).toBe("\tlink\ta6,#-32");
  });
});
