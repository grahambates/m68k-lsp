import { parseFile } from "m68k-parser";
import { normalizeRuleImpactAuditSource, ruleImpactAuditCases } from "../audit/rule-impact.js";
import { effectiveSeverity, lintParsedFile, lintSource } from "../core/lint.js";
import { defaultRules } from "../rules/index.js";

/**
 * `--goal speed` and `--goal size` filter on measured impact. Rules also
 * carried hand-written `speed` and `size` tags that nothing read and that
 * disagreed with the measurements in 49 places; those are gone.
 *
 * What remains is `serves`, a declaration that a rewrite trades one resource
 * for the other and is only advice under one goal. It is declared rather than
 * inferred because impact is measured only for 68000 targets and only when
 * measurement is on — and because it decides whether a rule runs at all, which
 * is what keeps a rule and its inverse from ever being live together.
 */
const byId = new Map(defaultRules.map((rule) => [rule.meta.id, rule]));

function measuredCosts() {
  const rows: { ruleId: string; bytes: number; cycles?: number; serves?: string }[] = [];
  for (const testCase of ruleImpactAuditCases) {
    if (testCase.exempt || testCase.source === undefined) continue;
    const rule = byId.get(testCase.ruleId);
    if (!rule) continue;
    const source = normalizeRuleImpactAuditSource(testCase.source);
    // Balanced, so a rule that serves one goal is not filtered out before it reports.
    for (const diagnostic of lintParsedFile(parseFile(source), source, {
      processors: [testCase.processor ?? "mc68000"],
      goal: "balanced",
    })) {
      if (diagnostic.ruleId !== testCase.ruleId) continue;
      const bytes = diagnostic.suggestion?.impact?.sizeBytes?.delta;
      if (bytes === undefined) continue;
      rows.push({
        ruleId: diagnostic.ruleId,
        bytes,
        cycles: diagnostic.suggestion?.impact?.execution?.cpuCycles?.delta,
        serves: rule.meta.serves,
      });
    }
  }
  return rows;
}

describe("the declared goal agrees with what is measured", () => {
  test("a rule that costs bytes serves speed", () => {
    const wrong = measuredCosts()
      .filter((r) => r.bytes > 0 && r.serves !== "speed")
      .map((r) => `${r.ruleId} (+${r.bytes} bytes, serves ${r.serves ?? "nothing"})`);
    expect(wrong).toEqual([]);
  });

  test("a rule that costs cycles serves size", () => {
    const wrong = measuredCosts()
      .filter((r) => (r.cycles ?? 0) > 0 && r.serves !== "size")
      .map((r) => `${r.ruleId} (+${r.cycles} cycles, serves ${r.serves ?? "nothing"})`);
    expect(wrong).toEqual([]);
  });

  test("a rule that costs nothing declares no goal", () => {
    const wrong = measuredCosts()
      .filter((r) => r.bytes <= 0 && (r.cycles ?? 0) <= 0 && r.serves !== undefined)
      .map((r) => `${r.ruleId} (serves ${r.serves})`);
    expect(wrong).toEqual([]);
  });

  test("the corpus measures enough for these checks to mean something", () => {
    const rows = measuredCosts();
    expect(rows.length).toBeGreaterThan(50);
    expect(rows.some((r) => r.serves === "speed")).toBe(true);
  });
});

describe("a rule and its inverse are never both live", () => {
  // Asks the real gate rather than restating its logic, so the two cannot drift.
  const active = (goal: "balanced" | "speed" | "size") =>
    defaultRules.filter((rule) => effectiveSeverity(rule, { processors: ["mc68000"], goal }) !== "off");

  test.each(["balanced", "speed", "size"] as const)("in %s runs", (goal) => {
    const live = new Set(active(goal).map((rule) => rule.meta.id));
    const conflicts = [...live]
      .map((id) => byId.get(id))
      .filter((rule) => rule?.meta.inverseOf && live.has(rule.meta.inverseOf))
      .map((rule) => `${rule!.meta.id} and ${rule!.meta.inverseOf}`);
    expect(conflicts).toEqual([]);
  });

  test("every inverseOf names a rule that exists", () => {
    const dangling = defaultRules
      .filter((rule) => rule.meta.inverseOf && !byId.has(rule.meta.inverseOf))
      .map((rule) => `${rule.meta.id} -> ${rule.meta.inverseOf}`);
    expect(dangling).toEqual([]);
  });

  test("an inverse serves the opposite goal to the rule it undoes", () => {
    const mismatched = defaultRules
      .filter((rule) => rule.meta.inverseOf)
      .filter((rule) => {
        const other = byId.get(rule.meta.inverseOf!);
        return !rule.meta.serves || !other?.meta.serves || rule.meta.serves === other.meta.serves;
      })
      .map((rule) => rule.meta.id);
    expect(mismatched).toEqual([]);
  });
});

describe("the shift and add pair", () => {
  const shifted = ["\tlsl.w #2,d0", "\tmoveq #0,d7", "\trts"].join("\n");
  const doubled = ["\tadd.w d0,d0", "\tadd.w d0,d0", "\tmoveq #0,d7", "\trts"].join("\n");
  const fires = (source: string, ruleId: string, goal: "balanced" | "speed" | "size") =>
    lintSource(source, { processors: ["mc68000"], goal }).some((d) => d.ruleId === ruleId);

  test("speed runs shift-to-adds and not its inverse", () => {
    expect(fires(shifted, "optimization/shift-two-adds", "speed")).toBe(true);
    expect(fires(doubled, "optimization/adds-to-shift", "speed")).toBe(false);
  });

  test("size runs adds-to-shift and not its inverse", () => {
    expect(fires(doubled, "optimization/adds-to-shift", "size")).toBe(true);
    expect(fires(shifted, "optimization/shift-two-adds", "size")).toBe(false);
  });

  // The canonical direction is the one that does not declare itself an inverse.
  test("balanced keeps only the canonical direction", () => {
    expect(fires(shifted, "optimization/shift-two-adds", "balanced")).toBe(true);
    expect(fires(doubled, "optimization/adds-to-shift", "balanced")).toBe(false);
  });

  // Without measurement the declaration alone has to hold the line.
  test("the declaration stands in when nothing is measured", () => {
    const unmeasured = (source: string, ruleId: string, goal: "speed" | "size") =>
      lintSource(source, { processors: ["mc68000"], goal, measureImpact: false }).some((d) => d.ruleId === ruleId);
    expect(unmeasured(shifted, "optimization/shift-two-adds", "size")).toBe(false);
    expect(unmeasured(doubled, "optimization/adds-to-shift", "speed")).toBe(false);
  });
});
