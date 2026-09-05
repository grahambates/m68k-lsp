import { lintSource } from "../core/lint.js";

function ids(source: string): string[] {
  return lintSource(source).map((diagnostic) => diagnostic.ruleId);
}

describe("correctness and suspicious footgun rules", () => {
  test("flags zero-sized DS declarations", () => {
    const diagnostics = lintSource("item: ds.w 0\nnext: dc.w 1");
    const diagnostic = diagnostics.find((d) => d.ruleId === "suspicious/zero-sized-storage");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.message).toContain("zero elements");
  });

  test("does not flag non-zero DS declarations", () => {
    expect(ids("item: ds.w 4")).not.toContain("suspicious/zero-sized-storage");
  });

  test("flags a condition that intentionally crosses a CCR-preserving instruction", () => {
    const source = [
      "    cmp.w #0,d0",
      "    adda.w #4,a0",
      "    beq .done",
      "    moveq #1,d1",
      ".done:",
      "    rts",
    ].join("\n");
    expect(ids(source)).toContain("suspicious/condition-after-preserved-ccr");
    expect(ids(source)).not.toContain("correctness/stale-condition-code");
  });

  test("stale unknown CCR remains owned by correctness rule, not suspicious preserved-CCR rule", () => {
    const source = [
      "    adda.w #4,a0",
      "    beq .done",
      ".done:",
      "    rts",
    ].join("\n");
    expect(ids(source)).toContain("correctness/stale-condition-code");
    expect(ids(source)).not.toContain("suspicious/condition-after-preserved-ccr");
  });

  test("flags MOVEA.W sign extension including generic MOVE spelling", () => {
    expect(ids("    move.w d0,a0")).toContain("suspicious/movea-word-sign-extension");
    expect(ids("    movea.w (a0),a1")).not.toContain("suspicious/movea-word-sign-extension");
    expect(ids("    move.l d0,a0")).not.toContain("suspicious/movea-word-sign-extension");
  });

  test("flags immediate bit numbers that wrap for memory or data registers", () => {
    const memory = lintSource("    btst #8,(a0)").find((d) => d.ruleId === "suspicious/bit-number-wraparound");
    expect(memory?.message).toContain("bit 0");
    expect(ids("    bset #32,d0")).toContain("suspicious/bit-number-wraparound");
    expect(ids("    bset #7,(a0)")).not.toContain("suspicious/bit-number-wraparound");
    expect(ids("    bset #31,d0")).not.toContain("suspicious/bit-number-wraparound");
  });

  test("flags partial MOVE writes when preserved upper bits are later consumed", () => {
    const source = [
      "    move.b (a0),d0",
      "    move.l d0,d1",
      "    rts",
    ].join("\n");
    expect(ids(source)).toContain("suspicious/partial-register-write");
  });

  test("does not flag partial MOVE when a full overwrite occurs before upper bits are used", () => {
    const source = [
      "    move.b (a0),d0",
      "    moveq #0,d0",
      "    move.l d0,d1",
      "    rts",
    ].join("\n");
    expect(ids(source)).not.toContain("suspicious/partial-register-write");
  });

});
