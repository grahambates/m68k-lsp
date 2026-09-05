import { parseFile, type ParsedFile } from "m68k-parser";
import { DefaultRuleContext } from "./context.js";
import { defaultConfig, type LintConfig } from "./config.js";
import type { Diagnostic, Severity } from "./diagnostic.js";
import type { Rule } from "./rule.js";
import { defaultRules } from "../rules/index.js";
import { measureDiagnosticImpact } from "../analysis/impact.js";
import { createInlineSuppression } from "./inline-config.js";

function matchesOptimizationGoal(diagnostic: Diagnostic, rule: Rule | undefined, config: LintConfig): boolean {
  const goal = config.goal ?? "balanced";
  if (goal === "balanced" || !diagnostic.suggestion) return true;
  if (diagnostic.category !== "optimization") return true;

  const impact = diagnostic.suggestion.impact;
  if (goal === "size") {
    if (impact?.sizeBytes) return impact.sizeBytes.delta <= 0;
    // Historical sources often tell us a transform is a speed/size trade-off
    // before we have exact byte metrics. Keep those out of size-focused runs.
    if (rule?.meta.tags?.includes("speed-size-tradeoff")) return false;
    return true;
  }

  // For speed, only suppress when we have affirmative evidence that the
  // replacement is slower. Unknown timing remains visible.
  if (impact?.execution?.cpuCycles) return impact.execution.cpuCycles.delta <= 0;
  return true;
}

function effectiveSeverity(rule: Rule, config: LintConfig): Severity | "off" {
  if (config.categories?.[rule.meta.category] === false) return "off";
  if (rule.meta.platforms && !rule.meta.platforms.includes(config.platform ?? "generic")) return "off";

  const explicit = config.rules?.[rule.meta.id];
  if (explicit) return explicit;

  if (rule.meta.enabledByDefault === false) {
    const enabledByPreset = rule.meta.presets?.some((preset) => config.presets?.includes(preset));
    return enabledByPreset ? rule.meta.defaultSeverity : "off";
  }
  return rule.meta.defaultSeverity;
}

export function lintParsedFile(
  file: ParsedFile,
  source: string,
  config: LintConfig = defaultConfig,
  rules: readonly Rule[] = defaultRules,
): Diagnostic[] {
  const ctx = new DefaultRuleContext(file, source, config);

  for (const rule of rules) {
    const severity = effectiveSeverity(rule, config);
    if (severity === "off") continue;

    const before = ctx.getDiagnostics().length;

    if (rule.checkLine) {
      file.lines.forEach((line, index) => rule.checkLine?.(ctx, line, index));
    }
    rule.checkFile?.(ctx);

    // Rule authors use defaultSeverity in diagnostics. Apply user override in
    // one central place so rules stay configuration-agnostic.
    const diagnostics = ctx.getDiagnostics() as Diagnostic[];
    for (let i = before; i < diagnostics.length; i++) {
      diagnostics[i] = { ...diagnostics[i], severity };
    }
  }

  const ruleById = new Map(rules.map((rule) => [rule.meta.id, rule] as const));
  const rawDiagnostics = [...ctx.getDiagnostics()];
  const suppression = config.inlineConfig === false ? undefined : createInlineSuppression(source);
  const unsuppressed = suppression ? rawDiagnostics.filter((diagnostic) => !suppression(diagnostic)) : rawDiagnostics;
  const measured = unsuppressed.map((diagnostic) => {
    if (config.measureImpact === false || !config.processors.includes("mc68000")) return diagnostic;
    if (!diagnostic.suggestion || diagnostic.category !== "optimization") return diagnostic;
    return measureDiagnosticImpact(diagnostic, file, source, ruleById.get(diagnostic.ruleId));
  });
  const reported = measured.filter((diagnostic) =>
    matchesOptimizationGoal(diagnostic, ruleById.get(diagnostic.ruleId), config),
  );

  // Rules run in registration order, so without this diagnostics come back
  // grouped by rule rather than in the order a reader encounters them in the
  // file. Sort by position, keeping rule order as the tie-break so output stays
  // deterministic for two rules matching the same spot.
  return reported
    .map((diagnostic, order) => ({ diagnostic, order }))
    .sort(
      (a, b) =>
        (a.diagnostic.loc.line ?? 0) - (b.diagnostic.loc.line ?? 0) ||
        a.diagnostic.loc.start - b.diagnostic.loc.start ||
        a.order - b.order,
    )
    .map((entry) => entry.diagnostic);
}

export function lintSource(
  source: string,
  config: LintConfig = defaultConfig,
  rules: readonly Rule[] = defaultRules,
): Diagnostic[] {
  return lintParsedFile(parseFile(source), source, config, rules);
}
