#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseFile, type ParseError } from "m68k-parser";
import { lintParsedFile } from "../core/lint.js";
import {
  defaultConfig,
  type LintConfig,
  type OptimizationGoal,
  type Platform,
  type Processor,
  type RulePreset,
  type RuleSetting,
} from "../core/config.js";
import type { Diagnostic, RuleCategory, Severity } from "../core/diagnostic.js";
import { formatImpact, paint } from "./format.js";
import {
  collectInitAnswers,
  describeInitConfig,
  detectSourceGlobs,
  initConfigFileName,
  normalizeIgnoreGlobs,
  renderInitConfig,
  terminalPrompt,
  validateProcessors,
} from "./init.js";
import { defaultRules } from "../rules/index.js";
import { asp68kCoverage, asp68kCoverageSummary } from "../coverage-asp68k.js";
import { runRuleImpactAudit } from "../audit/rule-impact.js";
import { defaultAssemblyExtensions, discoverFiles, normalizeExtensions } from "./file-discovery.js";
import { findProjectConfig, loadProjectConfig, type ProjectConfig } from "./project-config.js";

const VERSION = "0.46.2";

const processors: readonly Processor[] = ["mc68000", "mc68010", "mc68020", "mc68030", "mc68040", "mc68060", "cpu32"];
const categories: readonly RuleCategory[] = ["correctness", "suspicious", "optimization", "portability", "style"];
const settings: readonly RuleSetting[] = ["off", "error", "warning", "suggestion", "info"];
const severityRank: Record<Severity, number> = { error: 0, warning: 1, suggestion: 2, info: 3 };

type OutputFormat = "pretty" | "json";
const goals: readonly OptimizationGoal[] = ["balanced", "speed", "size"];
const platforms: readonly Platform[] = ["generic", "amiga", "atari"];
const presets: readonly RulePreset[] = ["recommended", "style"];

interface CliOptions {
  files: string[];
  configPath?: string;
  useConfig: boolean;
  extensions?: string[];
  ignorePatterns: string[];
  presets: RulePreset[];
  processors?: Processor[];
  platform?: Platform;
  goal?: OptimizationGoal;
  onlyCategories?: RuleCategory[];
  disabledCategories: RuleCategory[];
  rules: Record<string, RuleSetting>;
  format: OutputFormat;
  failOn: Severity;
  color: boolean;
  listRules: boolean;
  asp68kCoverage: boolean;
  measureImpact?: boolean;
  inlineConfig?: boolean;
  impactSummary: boolean;
  auditRuleImpact: boolean;
  init: boolean;
}

function usage(): string {
  return `m68k-lint ${VERSION}\n\nUsage:\n  m68k-lint [options] <file|directory|glob ...>\n\nOptions:\n  --config <path>               Use a specific JSON config file\n  --no-config                   Disable config-file discovery\n  --ext <ext[,ext...]>          Extensions for directory/glob discovery; default: .s,.asm,.i\n  --ignore-pattern <glob>       Ignore matching files (repeatable)\n  --cpu <cpu[,cpu...]>          Target processor(s), default: mc68000\n  --platform <name>             generic, amiga, atari; default: generic\n  --preset <name[,name...]>     Enable rule preset(s): recommended, style\n  --goal <balanced|speed|size>  Filter known optimization trade-offs, default: balanced\n  --impact                      Enable exact 68000 impact measurement\n  --no-impact                   Disable exact 68000 impact measurement\n  --inline-config               Honor m68k-lint comment directives (default)\n  --no-inline-config            Ignore m68k-lint comment directives\n  --impact-summary              Summarize measured outcomes by rule\n  --audit-rule-impact           Run representative 68000 timing audit for every optimization rule\n  --only <category[,category]>  Run only selected rule categories\n  --disable-category <category> Disable a rule category (repeatable)\n  --rule <id>=<setting>         Override a rule: off|error|warning|suggestion|info\n  --format <pretty|json>        Output format, default: pretty\n  --fail-on <severity>          Exit 1 at this severity or higher, default: error\n  --init                        Create a project config file interactively\n  --list-rules                  List built-in rules and exit\n  --asp68k-coverage             Show tracked ASP68K table coverage and exit\n  --color / --no-color          Force or disable ANSI colours; default: TTY only\n  -h, --help                    Show this help\n  -v, --version                 Show version\n\nExamples:\n  m68k-lint game.s\n  m68k-lint src/\n  m68k-lint "src/**/*.asm"\n  m68k-lint --ext .s,.asm,.i,.inc src/\n  m68k-lint --platform amiga --cpu mc68000 src/\n  m68k-lint --rule suspicious/nop=warning --fail-on warning game.s\n`;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function parseCsv<T extends string>(value: string, allowed: readonly T[], option: string): T[] {
  const values = value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  for (const item of values) {
    if (!allowed.includes(item as T)) {
      throw new Error(`${option}: unknown value '${item}'. Expected one of: ${allowed.join(", ")}`);
    }
  }
  return values as T[];
}

function parseArgs(argv: string[]): CliOptions | "help" | "version" {
  const options: CliOptions = {
    files: [],
    useConfig: true,
    ignorePatterns: [],
    presets: [],
    disabledCategories: [],
    rules: {},
    format: "pretty",
    failOn: "error",
    color: process.stdout.isTTY && !process.env.NO_COLOR,
    listRules: false,
    asp68kCoverage: false,
    impactSummary: false,
    auditRuleImpact: false,
    init: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") return "help";
    if (arg === "-v" || arg === "--version") return "version";
    if (arg === "--no-color") {
      options.color = false;
      continue;
    }
    if (arg === "--color") {
      options.color = true;
      continue;
    }
    if (arg === "--impact") {
      options.measureImpact = true;
      continue;
    }
    if (arg === "--no-impact") {
      options.measureImpact = false;
      continue;
    }
    if (arg === "--no-config") {
      options.useConfig = false;
      continue;
    }
    if (arg === "--inline-config") {
      options.inlineConfig = true;
      continue;
    }
    if (arg === "--no-inline-config") {
      options.inlineConfig = false;
      continue;
    }
    if (arg === "--impact-summary") {
      options.impactSummary = true;
      continue;
    }
    if (arg === "--audit-rule-impact") {
      options.auditRuleImpact = true;
      continue;
    }
    if (arg === "--init") {
      options.init = true;
      continue;
    }
    if (arg === "--list-rules") {
      options.listRules = true;
      continue;
    }
    if (arg === "--asp68k-coverage") {
      options.asp68kCoverage = true;
      continue;
    }
    if (arg === "--config") {
      options.configPath = requireValue(argv, i, arg);
      i++;
      continue;
    }
    if (arg === "--ext") {
      options.extensions = normalizeExtensions([
        ...(options.extensions ?? []),
        ...requireValue(argv, i, arg)
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      ]);
      i++;
      continue;
    }
    if (arg === "--ignore-pattern") {
      options.ignorePatterns.push(requireValue(argv, i, arg));
      i++;
      continue;
    }
    if (arg === "--cpu") {
      options.processors = parseCsv(requireValue(argv, i, arg), processors, arg);
      i++;
      continue;
    }
    if (arg === "--platform") {
      const value = requireValue(argv, i, arg) as Platform;
      if (!platforms.includes(value)) throw new Error(`--platform must be one of: ${platforms.join(", ")}`);
      options.platform = value;
      i++;
      continue;
    }
    if (arg === "--preset") {
      options.presets.push(...parseCsv(requireValue(argv, i, arg), presets, arg));
      i++;
      continue;
    }
    if (arg === "--goal") {
      const value = requireValue(argv, i, arg) as OptimizationGoal;
      if (!goals.includes(value)) throw new Error("--goal must be balanced, speed, or size");
      options.goal = value;
      i++;
      continue;
    }
    if (arg === "--only") {
      options.onlyCategories = parseCsv(requireValue(argv, i, arg), categories, arg);
      i++;
      continue;
    }
    if (arg === "--disable-category") {
      options.disabledCategories.push(...parseCsv(requireValue(argv, i, arg), categories, arg));
      i++;
      continue;
    }
    if (arg === "--format") {
      const value = requireValue(argv, i, arg);
      if (value !== "pretty" && value !== "json") throw new Error("--format must be 'pretty' or 'json'");
      options.format = value;
      i++;
      continue;
    }
    if (arg === "--fail-on") {
      const value = requireValue(argv, i, arg) as Severity;
      if (!(value in severityRank)) throw new Error("--fail-on must be error, warning, suggestion, or info");
      options.failOn = value;
      i++;
      continue;
    }
    if (arg === "--rule") {
      const value = requireValue(argv, i, arg);
      const split = value.lastIndexOf("=");
      if (split <= 0) throw new Error("--rule expects <rule-id>=<setting>");
      const id = value.slice(0, split);
      const setting = value.slice(split + 1) as RuleSetting;
      if (!settings.includes(setting)) throw new Error(`Unknown rule setting '${setting}'`);
      options.rules[id] = setting;
      i++;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`Unknown option '${arg}'`);
    options.files.push(arg);
  }

  return options;
}

function buildConfig(options: CliOptions, project: ProjectConfig = {}): LintConfig {
  const config: LintConfig = {
    ...defaultConfig,
    processors: options.processors ?? project.processors ?? defaultConfig.processors,
    platform: options.platform ?? project.platform ?? defaultConfig.platform,
    goal: options.goal ?? project.goal ?? defaultConfig.goal,
    measureImpact: options.measureImpact ?? project.measureImpact ?? defaultConfig.measureImpact,
    inlineConfig: options.inlineConfig ?? project.inlineConfig ?? defaultConfig.inlineConfig,
    presets: [...new Set([...(defaultConfig.presets ?? []), ...(project.presets ?? []), ...options.presets])],
    rules: { ...(project.rules ?? {}), ...options.rules },
  };

  const categoryConfig: Partial<Record<RuleCategory, boolean>> = { ...(project.categories ?? {}) };
  if (options.onlyCategories) {
    for (const category of categories) categoryConfig[category] = options.onlyCategories.includes(category);
  }
  for (const category of options.disabledCategories) categoryConfig[category] = false;
  if (Object.keys(categoryConfig).length) config.categories = categoryConfig;
  if (!Object.keys(config.rules ?? {}).length) config.rules = undefined;
  return config;
}

function severityLabel(severity: Severity, color: boolean): string {
  const code = severity === "error" ? 31 : severity === "warning" ? 33 : severity === "suggestion" ? 36 : 90;
  return paint(color, code, severity);
}

function sourceContext(source: string, line?: number, start = 0, end = start + 1, color = false): string[] {
  if (!line || line < 1) return [];
  const text = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")[line - 1];
  if (text === undefined) return [];
  const width = Math.max(1, end - start);
  // Assembly is tab-indented, and a tab is one character but several columns.
  // Reuse the source's own tabs in the pointer prefix so the caret lines up
  // whatever tab width the terminal uses.
  const prefix = text.slice(0, Math.max(0, start)).replace(/[^\t]/g, " ");
  const pointer = `${prefix}${"^"}${"~".repeat(Math.max(0, width - 1))}`;
  return [`  ${text}`, paint(color, 90, `  ${pointer}`)];
}

function formatDiagnostic(file: string, source: string, diagnostic: Diagnostic, color: boolean): string {
  const line = diagnostic.loc.line ?? 1;
  const col = diagnostic.loc.start + 1;
  const location = `${file}:${line}:${col}`;
  const header = `${severityLabel(diagnostic.severity, color)}  ${diagnostic.message}  ${paint(color, 90, `[${diagnostic.ruleId}]`)}`;
  const lines = [location, header, ...sourceContext(source, line, diagnostic.loc.start, diagnostic.loc.end, color)];
  if (diagnostic.suggestion) {
    // "fix" rather than "suggestion": the severity column already says
    // suggestion, and the same word twice reads as a mistake.
    lines.push(
      `  ${paint(color, 36, "fix:")} ${diagnostic.suggestion.description} (${diagnostic.suggestion.applicability})`,
    );
    if (diagnostic.suggestion.replacement)
      lines.push(`  ${paint(color, 90, "replace with:")} ${diagnostic.suggestion.replacement}`);
    const impact = diagnostic.suggestion.impact;
    if (impact) {
      const summary = formatImpact(impact, color);
      if (summary) lines.push(summary);
    }
  }
  for (const note of diagnostic.notes ?? []) lines.push(`  ${paint(color, 90, "note:")} ${note.message}`);
  return lines.join("\n");
}

function formatParseError(file: string, source: string, error: ParseError, color: boolean): string {
  const line = error.loc.line ?? 1;
  const col = error.loc.start + 1;
  const lines = [
    `${file}:${line}:${col}  ${paint(color, 31, "error")}  ${error.message}  ${paint(color, 90, `[parser/${error.code}]`)}`,
    ...sourceContext(source, line, error.loc.start, error.loc.end, color),
  ];
  if (error.hint) lines.push(`  ${paint(color, 90, "hint:")} ${error.hint}`);
  return lines.join("\n");
}

function failsThreshold(diagnostics: Diagnostic[], threshold: Severity): boolean {
  const rank = severityRank[threshold];
  return diagnostics.some((d) => severityRank[d.severity] <= rank);
}

function formatImpactSummary(diagnostics: Diagnostic[]): string | undefined {
  const byRule = new Map<string, Record<"improvement" | "tradeoff" | "neutral" | "regression", number>>();
  for (const d of diagnostics) {
    const assessment = d.suggestion?.impact?.assessment;
    if (!assessment) continue;
    const counts = byRule.get(d.ruleId) ?? { improvement: 0, tradeoff: 0, neutral: 0, regression: 0 };
    counts[assessment]++;
    byRule.set(d.ruleId, counts);
  }
  if (!byRule.size) return undefined;

  const rank = (counts: Record<string, number>) =>
    counts.regression * 1000 + counts.tradeoff * 100 + counts.neutral * 10 + counts.improvement;
  const rows = [...byRule.entries()].sort((a, b) => rank(b[1]) - rank(a[1]) || a[0].localeCompare(b[0]));
  const lines = ["68000 impact summary by rule:", "assessment\trule\tcount"];
  for (const [rule, counts] of rows) {
    for (const assessment of ["regression", "tradeoff", "neutral", "improvement"] as const) {
      if (counts[assessment]) lines.push(`${assessment}\t${rule}\t${counts[assessment]}`);
    }
  }
  return lines.join("\n");
}

async function lintOne(path: string, options: CliOptions, config: LintConfig) {
  const source = await readFile(path, "utf8");
  const parsed = parseFile(source);
  const diagnostics = lintParsedFile(parsed, source, config);
  return { path, source, parseErrors: parsed.errors, diagnostics };
}

async function runInit(color: boolean): Promise<number> {
  if (!process.stdin.isTTY) {
    console.error("m68k-lint: --init needs an interactive terminal. Write m68k-lint.json by hand instead;");
    console.error("its schema is at node_modules/m68k-lint/m68k-lint.schema.json.");
    return 2;
  }

  const target = resolve(process.cwd(), initConfigFileName);
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let existing = false;
    try {
      await readFile(target, "utf8");
      existing = true;
    } catch {
      // No config yet, which is the normal case.
    }

    const prompt = terminalPrompt(rl);
    if (existing && !(await prompt.confirm(`${initConfigFileName} already exists. Overwrite?`, false))) {
      console.log("Cancelled; nothing written.");
      return 0;
    }

    const answers = await collectInitAnswers(prompt, await detectSourceGlobs(process.cwd()));
    answers.processors = validateProcessors(answers.processors);
    answers.ignores = normalizeIgnoreGlobs(answers.ignores);

    const contents = renderInitConfig(answers);
    console.log(`\n${contents}`);
    if (!(await prompt.confirm(`Write ${initConfigFileName}?`, true))) {
      console.log("Cancelled; nothing written.");
      return 0;
    }

    await writeFile(target, contents, "utf8");
    console.log(`${paint(color, 32, "Created")} ${initConfigFileName} (${describeInitConfig(answers)})`);
    return 0;
  } catch (error) {
    console.error(`m68k-lint: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  } finally {
    rl.close();
  }
}

async function main(): Promise<number> {
  let parsedArgs: CliOptions | "help" | "version";
  try {
    parsedArgs = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`m68k-lint: ${error instanceof Error ? error.message : String(error)}\n`);
    console.error(usage());
    return 2;
  }

  if (parsedArgs === "help") {
    console.log(usage());
    return 0;
  }
  if (parsedArgs === "version") {
    console.log(VERSION);
    return 0;
  }

  const options = parsedArgs;
  if (options.init) return runInit(options.color);
  if (options.listRules) {
    for (const rule of defaultRules) {
      const state = rule.meta.enabledByDefault === false ? "off by default" : rule.meta.defaultSeverity;
      const scope = rule.meta.platforms?.length ? ` [${rule.meta.platforms.join(",")}]` : "";
      const preset = rule.meta.presets?.length ? ` [preset:${rule.meta.presets.join(",")}]` : "";
      console.log(`${rule.meta.id}\t${rule.meta.category}\t${state}\t${rule.meta.description}${scope}${preset}`);
    }
    return 0;
  }
  if (options.auditRuleImpact) {
    const audit = runRuleImpactAudit();
    if (options.format === "json") {
      console.log(JSON.stringify({ version: VERSION, audit }, null, 2));
    } else {
      const order = {
        regression: 0,
        tradeoff: 1,
        partial: 2,
        neutral: 3,
        unmeasured: 4,
        "not-triggered": 5,
        "missing-case": 6,
        improvement: 7,
        exempt: 8,
      } as const;
      for (const r of [...audit].sort(
        (a, b) => order[a.status] - order[b.status] || a.ruleId.localeCompare(b.ruleId),
      )) {
        const deltas =
          r.status === "improvement" ||
          r.status === "tradeoff" ||
          r.status === "neutral" ||
          r.status === "regression" ||
          r.status === "partial"
            ? `\tsize ${r.sizeDelta ?? "?"}\tcpu ${r.cpuDelta ?? "?"}\tr ${r.readDelta ?? "?"}\tw ${r.writeDelta ?? "?"}`
            : "";
        console.log(
          `${r.status}\t${r.ruleId}${deltas}${r.exempt ? `\t${r.exempt}` : ""}${r.detail ? `\t${r.detail}` : ""}`,
        );
      }
      const counts = new Map<string, number>();
      for (const r of audit) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
      const auditedRuleCount = new Set(audit.map((r) => r.ruleId)).size;
      console.log(
        `\nRule impact audit: ${audit.length} cases across ${auditedRuleCount} rules; ${counts.get("regression") ?? 0} regressions, ${counts.get("tradeoff") ?? 0} tradeoffs, ${counts.get("partial") ?? 0} partial, ${counts.get("improvement") ?? 0} improvements, ${counts.get("unmeasured") ?? 0} unmeasured, ${counts.get("not-triggered") ?? 0} bad examples, ${counts.get("missing-case") ?? 0} missing cases, ${counts.get("exempt") ?? 0} exempt.`,
      );
    }
    // "unmeasured" is a failure too: docs/rule-impact-audit.md requires a rule the
    // 68000 counter cannot measure to carry an explicit exemption, so that new
    // rules cannot silently escape validation.
    const failing = new Set(["regression", "not-triggered", "missing-case", "unmeasured"]);
    return audit.some((r) => failing.has(r.status)) ? 1 : 0;
  }
  if (options.asp68kCoverage) {
    const summary = asp68kCoverageSummary();
    console.log(
      `ASP68K coverage: ${summary.implementedRows}/${summary.totalTransformRows} rows implemented; ${summary.trackedRows} rows tracked`,
    );
    console.log(
      `Tracked status counts: implemented ${summary.byStatus.implemented}, partial ${summary.byStatus.partial}, deferred ${summary.byStatus.deferred}, rejected ${summary.byStatus.rejected}, skipped ${summary.byStatus.skipped}`,
    );
    for (const entry of asp68kCoverage) {
      console.log(
        `${entry.status}\t${entry.sourceLines.join(",")}\t${entry.rule ?? "-"}${entry.note ? `\t${entry.note}` : ""}`,
      );
    }
    return 0;
  }
  let projectConfig: ProjectConfig = {};
  let projectConfigPath: string | undefined;
  if (options.configPath && !options.useConfig) {
    console.error("m68k-lint: --config cannot be combined with --no-config");
    return 2;
  }
  try {
    projectConfigPath = options.configPath
      ? resolve(options.configPath)
      : options.useConfig
        ? await findProjectConfig()
        : undefined;
    if (projectConfigPath) projectConfig = await loadProjectConfig(projectConfigPath);
  } catch (error) {
    console.error(`m68k-lint: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }

  const projectRoot = projectConfigPath ? dirname(projectConfigPath) : process.cwd();
  const rawInputs = options.files.length
    ? options.files.map((input) => resolve(process.cwd(), input))
    : (projectConfig.files ?? projectConfig.include ?? []).map((input) => resolve(projectRoot, input));
  if (!rawInputs.length) {
    console.error("m68k-lint: no input files, directories, or globs (and config has no include patterns)\n");
    console.error(usage());
    return 2;
  }

  let inputFiles: string[];
  try {
    inputFiles = await discoverFiles(rawInputs, {
      cwd: projectRoot,
      extensions: options.extensions ?? projectConfig.extensions ?? defaultAssemblyExtensions,
      ignorePatterns: [
        "node_modules/**",
        ".git/**",
        ...(projectConfig.ignores ?? projectConfig.ignorePatterns ?? []),
        ...options.ignorePatterns,
      ],
    });
  } catch (error) {
    console.error(`m68k-lint: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
  if (!inputFiles.length) {
    console.error(
      `m68k-lint: no matching assembly files (extensions: ${(options.extensions ?? projectConfig.extensions ?? defaultAssemblyExtensions).join(", ")})`,
    );
    return 2;
  }

  const config = buildConfig(options, projectConfig);
  const results = [];
  let ioFailed = false;
  for (const file of inputFiles) {
    try {
      results.push(await lintOne(file, options, config));
    } catch (error) {
      ioFailed = true;
      if (options.format === "json")
        results.push({ path: file, ioError: error instanceof Error ? error.message : String(error) });
      else
        console.error(
          `${file}: ${paint(options.color, 31, "error")}: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
  }

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          version: VERSION,
          configFile: projectConfigPath,
          processors: config.processors,
          platform: config.platform,
          goal: config.goal,
          files: results,
        },
        null,
        2,
      ),
    );
  } else {
    for (const result of results) {
      if (!("source" in result)) continue;
      const entries = [
        ...result.parseErrors.map((e) => formatParseError(result.path, result.source, e, options.color)),
        ...result.diagnostics.map((d) => formatDiagnostic(result.path, result.source, d, options.color)),
      ];
      if (entries.length) console.log(entries.join("\n\n"));
    }

    const parseErrorCount = results.reduce((n, r) => n + ("parseErrors" in r ? r.parseErrors.length : 0), 0);
    const diagnostics = results.flatMap((r) => ("diagnostics" in r ? r.diagnostics : []));
    if (options.impactSummary) {
      const summary = formatImpactSummary(diagnostics);
      if (summary) console.log(`\n${summary}`);
    }
    const counts = { error: 0, warning: 0, suggestion: 0, info: 0 } satisfies Record<Severity, number>;
    for (const d of diagnostics) counts[d.severity]++;
    const total = parseErrorCount + diagnostics.length;
    if (total) {
      console.log(
        `\n${total} issue${total === 1 ? "" : "s"}: ${parseErrorCount + counts.error} error, ${counts.warning} warning, ${counts.suggestion} suggestion, ${counts.info} info`,
      );
    }
  }

  const allDiagnostics = results.flatMap((r) => ("diagnostics" in r ? r.diagnostics : []));
  const hasParseErrors = results.some((r) => "parseErrors" in r && r.parseErrors.length > 0);
  return ioFailed || hasParseErrors || failsThreshold(allDiagnostics, options.failOn) ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`m68k-lint: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    process.exitCode = 2;
  });
