import { lintSource } from "../core/lint.js";

/**
 * A shift by a register is a range only because the count is unknown in
 * general: 68kcounter records it as `base + multiplier * n` over n in 0..63.
 * These rules fire only once constant propagation has proven the count, so
 * substituting it is the same arithmetic 68kcounter does for a literal count.
 *
 * Without that, only the size was comparable, and a rule that saves cycles at a
 * cost in bytes was reported as an outright regression.
 */
const impactOf = (lines: string[], ruleId: string) =>
  lintSource(lines.join("\n"), { processors: ["mc68000"] }).find((d) => d.ruleId === ruleId)?.suggestion?.impact;

describe("timing that depends on a proven shift count", () => {
  test("a known register count is measured rather than left a range", () => {
    const impact = impactOf(
      ["\tmoveq #24,d1", "\tlsr.l d1,d0", "\tmoveq #0,d1", "\tmoveq #0,d7", "\trts"],
      "optimization/stack-known-register-shift",
    );
    // LSR.L Dn,Dn is 8 + 2n, so 56 for n=24, plus 4 for the MOVEQ it replaces.
    expect(impact?.execution?.cpuCycles?.before).toBe(60);
    expect(impact?.execution?.cpuCycles?.confidence).toBe("exact");
    expect(impact?.execution?.cpuCycles?.delta).toBe(-36);
  });

  test("saving cycles at a cost in bytes reads as a trade-off, not a regression", () => {
    const impact = impactOf(
      ["\tmoveq #24,d1", "\tlsr.l d1,d0", "\tmoveq #0,d1", "\tmoveq #0,d7", "\trts"],
      "optimization/stack-known-register-shift",
    );
    expect(impact?.sizeBytes?.delta).toBeGreaterThan(0);
    expect(impact?.assessment).toBe("tradeoff");
  });

  test("a literal count was already measurable and is unchanged", () => {
    const impact = impactOf(["\tlsl.w #8,d0", "\tmoveq #0,d7", "\trts"], "optimization/stack-word-shift-eight");
    expect(impact?.execution?.cpuCycles?.delta).toBe(-2);
    expect(impact?.assessment).toBe("tradeoff");
  });

  // A conditional branch is a range too, but not because of a count: its
  // timing depends on whether it is taken. Reporting one path as the
  // measurement would be worse than reporting nothing.
  test("a range with no count behind it stays unmeasured", () => {
    const impact = impactOf(
      ["\tbtst #7,d0", "\tbne .x", ".x:", "\tmoveq #0,d7", "\trts"],
      "optimization/btst-sign-branch",
    );
    expect(impact).toBeDefined();
    expect(impact?.sizeBytes?.confidence).toBe("exact");
    expect(impact?.execution?.cpuCycles).toBeUndefined();
  });
});
