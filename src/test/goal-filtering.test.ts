import { parseFile } from "m68k-parser";
import { normalizeRuleImpactAuditSource, ruleImpactAuditCases } from "../audit/rule-impact.js";
import { lintParsedFile, lintSource } from "../core/lint.js";
import { defaultRules } from "../rules/index.js";

/**
 * `--goal speed` and `--goal size` filter on measured impact. Rules also
 * carried hand-written `speed` and `size` tags that nothing read and that
 * disagreed with the measurements in 49 places; those are gone.
 *
 * One tag still does work. Impact is only measured for 68000 targets, and only
 * when measurement is enabled, so `speed-size-tradeoff` is the fallback that
 * keeps a size-costing suggestion out of a size-focused run when there are no
 * numbers to consult.
 */
const byId = new Map(defaultRules.map((rule) => [rule.meta.id, rule]));

function measuredSizeDeltas() {
  const deltas: { ruleId: string; bytes: number; tagged: boolean }[] = [];
  for (const testCase of ruleImpactAuditCases) {
    if (testCase.exempt || testCase.source === undefined) continue;
    const rule = byId.get(testCase.ruleId);
    if (!rule) continue;
    const source = normalizeRuleImpactAuditSource(testCase.source);
    for (const diagnostic of lintParsedFile(parseFile(source), source, {
      processors: [testCase.processor ?? "mc68000"],
    })) {
      if (diagnostic.ruleId !== testCase.ruleId) continue;
      const bytes = diagnostic.suggestion?.impact?.sizeBytes?.delta;
      if (bytes === undefined) continue;
      deltas.push({ ruleId: diagnostic.ruleId, bytes, tagged: (rule.meta.tags ?? []).includes("speed-size-tradeoff") });
    }
  }
  return deltas;
}

describe("the tradeoff tag agrees with what is measured", () => {
  test("every rule that costs bytes carries it", () => {
    const untagged = measuredSizeDeltas()
      .filter((d) => d.bytes > 0 && !d.tagged)
      .map((d) => `${d.ruleId} (+${d.bytes} bytes)`);
    expect(untagged).toEqual([]);
  });

  test("no rule carries it while saving or keeping bytes", () => {
    const overtagged = measuredSizeDeltas()
      .filter((d) => d.bytes <= 0 && d.tagged)
      .map((d) => `${d.ruleId} (${d.bytes} bytes)`);
    expect(overtagged).toEqual([]);
  });

  test("the corpus measures enough for the check to mean something", () => {
    const deltas = measuredSizeDeltas();
    expect(deltas.length).toBeGreaterThan(50);
    expect(deltas.some((d) => d.bytes > 0)).toBe(true);
  });
});

describe("goals filter on measured impact", () => {
  // Saves 12 cycles at a cost of 2 bytes.
  const tradeoff = ["\tmoveq #12,d1", "\tlsl.w d1,d0", "\tmoveq #0,d1", "\tmoveq #0,d7", "\trts"].join("\n");
  const RULE = "optimization/known-register-shift-reduction";
  const fires = (config: Parameters<typeof lintSource>[1]) =>
    lintSource(tradeoff, config).some((d) => d.ruleId === RULE);

  test("a size-costing speed win is shown for speed and hidden for size", () => {
    expect(fires({ processors: ["mc68000"], goal: "balanced" })).toBe(true);
    expect(fires({ processors: ["mc68000"], goal: "speed" })).toBe(true);
    expect(fires({ processors: ["mc68000"], goal: "size" })).toBe(false);
  });

  // Without measurement there are no deltas, and the tag has to carry it.
  test("the tag stands in when nothing is measured", () => {
    expect(fires({ processors: ["mc68000"], goal: "size", measureImpact: false })).toBe(false);
    expect(fires({ processors: ["mc68000"], goal: "speed", measureImpact: false })).toBe(true);
  });
});
