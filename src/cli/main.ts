#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { parseFile } from "m68k-parser";
import { lintParsedFile } from "../core/lint.js";
import { applyFixes, type FixResult } from "../core/fix.js";
import { runInteractive, type InteractiveResult } from "../core/interactive.js";
import type { Applicability, Diagnostic, OptimizationAssessment, RuleCategory, Severity } from "../core/diagnostic.js";
import { buildProjectSymbols, type ProjectSymbols } from "../analysis/project-symbols.js";
import type { ExternalSymbols } from "../analysis/symbols.js";
import {
  defaultConfig,
  type LintConfig,
  type OptimizationGoal,
  type Platform,
  type Processor,
  type RulePreset,
  type RuleSetting,
} from "../core/config.js";
import { formatImpact, paint, highlightAsm } from "./format.js";
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
import type { SourceSpan } from "../core/span.js";

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
  /** Rewrite files in place. Applies safe suggestions, plus conditional ones when asked. */
  fix: boolean;
  fixConditional: boolean;
  /** Report what would be rewritten without touching anything. */
  fixDryRun: boolean;
  /** Keep the original, commented out, above a rewrite that is hard to read back. */
  fixAnnotate: boolean;
  /** Review each finding and choose what to do with it. */
  fixInteractive: boolean;
}

function usage(): string {
  return `m68k-lint ${VERSION}\n\nUsage:\n  m68k-lint [options] <file|directory|glob ...>\n\nOptions:\n  --config <path>               Use a specific JSON config file\n  --no-config                   Disable config-file discovery\n  --ext <ext[,ext...]>          Extensions for directory/glob discovery; default: .s,.asm,.i\n  --ignore-pattern <glob>       Ignore matching files (repeatable)\n  --cpu <cpu[,cpu...]>          Target processor(s), default: mc68000\n  --platform <name>             generic, amiga, atari; default: generic\n  --preset <name[,name...]>     Enable rule preset(s): recommended, style\n  --goal <balanced|speed|size>  Filter known optimization trade-offs, default: balanced\n  --impact                      Enable exact 68000 impact measurement\n  --no-impact                   Disable exact 68000 impact measurement\n  --inline-config               Honor m68k-lint comment directives (default)\n  --no-inline-config            Ignore m68k-lint comment directives\n  --impact-summary              Summarize measured outcomes by rule\n  --audit-rule-impact           Run representative 68000 timing audit for every optimization rule\n  --only <category[,category]>  Run only selected rule categories\n  --disable-category <category> Disable a rule category (repeatable)\n  --rule <id>=<setting>         Override a rule: off|error|warning|suggestion|info\n  --fix                         Apply safe suggestions and rewrite the files\n  --fix-conditional             Also apply conditional ones; read their notes first\n  --fix-annotate                Keep the original, commented out, above an opaque rewrite\n  -i, --fix-interactive         Review each finding and choose what to do with it\n  --fix-dry-run                 Report what --fix would change, writing nothing\n  --format <pretty|json>        Output format, default: pretty\n  --fail-on <severity>          Exit 1 at this severity or higher, default: error\n  --init                        Create a project config file interactively\n  --list-rules                  List built-in rules and exit\n  --asp68k-coverage             Show tracked ASP68K table coverage and exit\n  --color / --no-color          Force or disable ANSI colours; default: TTY only\n  -h, --help                    Show this help\n  -v, --version                 Show version\n\nExamples:\n  m68k-lint game.s\n  m68k-lint src/\n  m68k-lint "src/**/*.asm"\n  m68k-lint --ext .s,.asm,.i,.inc src/\n  m68k-lint --platform amiga --cpu mc68000 src/\n  m68k-lint --rule suspicious/nop=warning --fail-on warning game.s\n  m68k-lint --fix src/\n`;
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
    fix: false,
    fixConditional: false,
    fixDryRun: false,
    fixAnnotate: false,
    fixInteractive: false,
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
    if (arg === "--fix") {
      options.fix = true;
      continue;
    }
    if (arg === "--fix-conditional") {
      options.fix = true;
      options.fixConditional = true;
      continue;
    }
    if (arg === "--fix-interactive" || arg === "-i") {
      options.fixInteractive = true;
      continue;
    }
    if (arg === "--fix-annotate") {
      options.fix = true;
      options.fixAnnotate = true;
      continue;
    }
    if (arg === "--fix-dry-run") {
      options.fix = true;
      options.fixDryRun = true;
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

/**
 * The source a finding covers.
 *
 * Every line of the match is shown, because a match is a run of instructions:
 * BSR followed by RTS is one finding about two lines, and drawing only the
 * first hid what the suggestion was going to replace.
 *
 * There is no caret. Rules point at a mnemonic -- all but one of them -- so an
 * underline never said more than "this instruction", which the line itself
 * already says, and under a multi-line match it marked one line of several as
 * though the others were context.
 */
function sourceContext(source: string, span: SourceSpan | undefined, color: boolean): string[] {
  if (!span) return [];
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const text: string[] = [];
  for (let line = span.startLine; line <= span.endLine; line++) {
    const content = lines[line - 1];
    if (content === undefined) continue;
    text.push(highlightAsm(content, color));
  }
  return text;
}

function formatApplicability(applicability: Applicability, color: boolean): string {
  const colors = {
    safe: 32,
    conditional: 33,
    manual: 34,
  };
  return paint(color, colors[applicability], applicability);
}

function formatDiagnostic(file: string, source: string, diagnostic: Diagnostic, color: boolean): string {
  const line = diagnostic.loc.line ?? 1;
  const col = diagnostic.loc.start + 1;
  const location = paint(color, 34, `${file}:${line}:${col}`);
  const header = `${severityLabel(diagnostic.severity, color)}  ${diagnostic.message}  ${paint(color, 90, `[${diagnostic.ruleId}]`)}`;
  const lines = [location, header, ...sourceContext(source, diagnostic.span, color)];
  if (diagnostic.suggestion) {
    const replacement = diagnostic.suggestion.replacement;
    const applicability = formatApplicability(diagnostic.suggestion.applicability, color);
    lines.push(`${paint(color, 90, "action:")} ${diagnostic.suggestion.description} (${applicability})`);
    if (replacement) {
      lines.push(...replacement.split("\n").map((text) => highlightAsm(text, color)));
    }
    const impact = diagnostic.suggestion.impact;
    if (impact) {
      const summary = formatImpact(impact, color);
      if (summary) lines.push(summary);
    }
  }
  const notes = diagnostic.notes ?? [];
  if (notes.length) {
    lines.push(`${paint(color, 90, "notes:")}`, ...notes.map((n) => " - " + n.message));
  }
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

/**
 * Turn rules off for the whole project, in the config file.
 *
 * A rule that does not suit a project should be said once rather than
 * commented on every occurrence. Written by reading and re-emitting the JSON so
 * that anything already there, including keys this version does not know about,
 * survives.
 */
async function disableRulesInConfig(configPath: string, ruleIds: readonly string[]): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
  } catch {
    // No config yet, or one we cannot read; start from an empty object rather
    // than refusing, since the rules still have to go somewhere.
  }
  const rules = { ...((existing.rules as Record<string, string> | undefined) ?? {}) };
  for (const ruleId of ruleIds) rules[ruleId] = "off";
  await writeFile(configPath, `${JSON.stringify({ ...existing, rules }, null, 2)}\n`, "utf8");
}

/**
 * Review the findings in one file, one at a time.
 *
 * Each is shown as it would be reported, followed by what applying it would
 * do, so the choice is made with the same information the report carries. A
 * finding with no rewrite can still be allowed here or turned off for the
 * project: those are the useful answers to "I have looked at this".
 */
async function reviewFile(
  path: string,
  source: string,
  diagnostics: readonly Diagnostic[],
  ask: (query: string) => Promise<string>,
  color: boolean,
): Promise<InteractiveResult> {
  return runInteractive(source, diagnostics, async (diagnostic) => {
    console.log(`\n${formatDiagnostic(path, source, diagnostic, color)}`);
    const fixable = diagnostic.suggestion?.replacement !== undefined;
    const choices = fixable ? "y/Y/n/N/a/d/q/?" : "n/N/a/d/q/?";
    for (;;) {
      // Case matters here, so the answer is not folded to lower case.
      const answer = (await ask(`  ${fixable ? "apply" : "no rewrite available"} [${choices}] `)).trim();
      if (answer === "?" || answer === "h") {
        if (fixable) {
          console.log("  y  apply the rewrite");
          console.log(`  Y  apply every remaining ${diagnostic.ruleId} without asking`);
        }
        console.log("  n  skip, and report it again next time");
        console.log(`  N  skip every remaining ${diagnostic.ruleId} in this run`);
        console.log("  a  allow here, adding a directive beside this code");
        console.log(`  d  disable ${diagnostic.ruleId} for the whole project`);
        console.log("  q  stop; what has been decided still stands");
        continue;
      }
      if (answer === "Y" && fixable) return "apply-rule";
      if (answer === "N") return "skip-rule";
      const lowered = answer.toLowerCase();
      if (lowered === "q") return "quit";
      if (lowered === "a") return "allow";
      if (lowered === "d") return "disable";
      if (lowered === "n" || lowered === "") return "skip";
      if (lowered === "y" && fixable) return "apply";
      console.error(`  Expected one of: ${choices}`);
    }
  });
}

async function lintOne(path: string, options: CliOptions, config: LintConfig, external?: ExternalSymbols) {
  let source = await readFile(path, "utf8");
  let fixed: FixResult | undefined;

  if (options.fix) {
    const accept: Applicability[] = options.fixConditional ? ["safe", "conditional"] : ["safe"];
    // A trade-off is only a decision once you have said which resource matters.
    // Under an explicit goal the filtering has already dropped the ones that
    // hurt it, so what is left genuinely helps the axis asked for; under
    // balanced it is a coin-flip the linter should not call. Neutral rewrites
    // are never applied: changing the file for no measured gain is churn.
    const goal = config.goal ?? "balanced";
    const acceptAssessments: OptimizationAssessment[] =
      goal === "balanced" ? ["improvement"] : ["improvement", "tradeoff"];
    // A rewrite that will not parse is worse than no rewrite, so a round whose
    // result reads worse than what went in is rolled back rather than written.
    const errorCount = parseFile(source).errors.length;
    fixed = applyFixes(source, (text) => lintParsedFile(parseFile(text), text, config, undefined, external), {
      accept,
      acceptAssessments,
      annotate: options.fixAnnotate,
      verify: (candidate) => parseFile(candidate).errors.length <= errorCount,
    });
    if (fixed.applied.length && !options.fixDryRun) {
      await writeFile(path, fixed.output, "utf8");
      source = fixed.output;
    } else if (fixed.applied.length) {
      source = fixed.output;
    }
  }

  const parsed = parseFile(source);
  const diagnostics = lintParsedFile(parsed, source, config, undefined, external);
  return { path, source, parseErrors: parsed.errors, diagnostics, fixed };
}

/**
 * Index constants defined anywhere in the project, so a file that uses a name
 * an include defines can still be analysed.
 *
 * Deliberately wider than the lint set: headers are often excluded from linting
 * but are exactly where constants live. Reading them costs one pass and the
 * index answers only for names the whole project agrees on, so a project with
 * conflicting definitions is no worse off than before.
 */
/**
 * Where to look for constants when no config file marks the project.
 *
 * `process.cwd()` is the wrong guess for `m68k-lint ../game/src`: it would index
 * the directory the command was typed in rather than the one being linted. The
 * inputs themselves say what the project is.
 */
function inputRoot(inputs: readonly string[], fallback: string): string {
  const directories = inputs.map((input) => {
    const absolute = resolve(fallback, input);
    return statSync(absolute, { throwIfNoEntry: false })?.isDirectory() ? absolute : dirname(absolute);
  });
  if (directories.length === 0) return fallback;

  let common = directories[0].split(sep);
  for (const directory of directories.slice(1)) {
    const parts = directory.split(sep);
    let i = 0;
    while (i < common.length && i < parts.length && common[i] === parts[i]) i++;
    common = common.slice(0, i);
  }
  return common.join(sep) || fallback;
}

async function buildProjectIndex(
  root: string,
  ignorePatterns: readonly string[],
  extensions: readonly string[],
): Promise<ProjectSymbols | undefined> {
  let paths: string[];
  try {
    paths = await discoverFiles([root], {
      cwd: root,
      extensions: [...new Set([...extensions, ...defaultAssemblyExtensions, ".inc", ".h"])],
      ignorePatterns: [...ignorePatterns],
    });
  } catch {
    return undefined;
  }

  const files = [];
  for (const path of paths) {
    try {
      files.push({ path: relative(root, path) || path, source: await readFile(path, "utf8") });
    } catch {
      // Unreadable files simply contribute nothing to the index.
    }
  }
  return buildProjectSymbols(files);
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
    // "unmeasured" is a failure too: notes/rule-impact-audit.md requires a rule the
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

  if (options.fixInteractive) {
    if (!process.stdin.isTTY) {
      console.error(
        "m68k-lint: --fix-interactive needs a terminal. Use --fix, or --fix-dry-run to see what it would do.",
      );
      return 2;
    }
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    let applied = 0;
    let suppressed = 0;
    const disabled = new Set<string>();
    try {
      for (const file of inputFiles) {
        const source = await readFile(file, "utf8");
        const active = { ...config, rules: { ...config.rules } };
        for (const ruleId of disabled) active.rules[ruleId] = "off";
        const diagnostics = lintParsedFile(parseFile(source), source, active);
        if (diagnostics.length === 0) continue;
        const result = await reviewFile(file, source, diagnostics, (query) => rl.question(query), options.color);
        if (result.output !== source) await writeFile(file, result.output, "utf8");
        applied += result.applied.length;
        suppressed += result.suppressed.length;
        for (const ruleId of result.disabledRules) disabled.add(ruleId);
        if (result.quit) break;
      }
    } finally {
      rl.close();
    }

    if (disabled.size) {
      const target = projectConfigPath ?? resolve(projectRoot, initConfigFileName);
      await disableRulesInConfig(target, [...disabled]);
      console.log(`\nturned off in ${relative(process.cwd(), target) || target}: ${[...disabled].join(", ")}`);
    }
    console.log(`${applied} applied, ${suppressed} allowed in place.`);
    return 0;
  }

  const projectIndex =
    config.projectSymbols === false
      ? undefined
      : await buildProjectIndex(
          projectConfigPath ? projectRoot : inputRoot(rawInputs, projectRoot),
          [
            "node_modules/**",
            ".git/**",
            ...(projectConfig.ignores ?? projectConfig.ignorePatterns ?? []),
            ...options.ignorePatterns,
          ],
          options.extensions ?? projectConfig.extensions ?? defaultAssemblyExtensions,
        );
  const results = [];
  let ioFailed = false;
  for (const file of inputFiles) {
    try {
      results.push(await lintOne(file, options, config, projectIndex));
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
    // One blank line between findings, two between files. Printing each file
    // with its own console.log gave the opposite: a blank line inside a file
    // and only a newline at the boundary between two, so the last finding of
    // one ran straight into the first of the next.
    const blocks = results
      .filter((result): result is Extract<typeof result, { source: string }> => "source" in result)
      .map((result) =>
        result.diagnostics.map((d) => formatDiagnostic(result.path, result.source, d, options.color)).join("\n\n"),
      )
      .filter((block) => block.length > 0);
    if (blocks.length) console.log(blocks.join("\n\n\n"));

    // Syntax belongs to the assembler, which reports it against its own grammar
    // rather than this parser's more permissive one. What is worth saying is
    // that a file was not fully read, so an empty result is not mistaken for a
    // verified one.
    // What changed on disk is the first thing to say, before what remains.
    for (const result of results) {
      const fixed = "fixed" in result ? result.fixed : undefined;
      if (!fixed || fixed.applied.length === 0) continue;
      const path = "path" in result ? result.path : "";
      const verb = options.fixDryRun ? "would fix" : "fixed";
      const counts = new Map<string, number>();
      for (const one of fixed.applied) counts.set(one.ruleId, (counts.get(one.ruleId) ?? 0) + 1);
      const detail = [...counts]
        .sort()
        .map(([ruleId, n]) => `${ruleId}${n > 1 ? ` x${n}` : ""}`)
        .join(", ");
      console.log(
        `\n${path}: ${verb} ${fixed.applied.length} ${fixed.applied.length === 1 ? "issue" : "issues"} ` +
          `${paint(options.color, 90, `(${detail})`)}`,
      );
    }
    for (const result of results) {
      const outcome = "fixed" in result ? result.fixed : undefined;
      if (outcome?.rejected) {
        const path = "path" in result ? result.path : "";
        console.log(
          paint(options.color, 33, `\n${path}: a rewrite was rolled back because the result would not have parsed.`),
        );
      }
    }

    for (const result of results) {
      if (!("parseErrors" in result) || result.parseErrors.length === 0) continue;
      console.log(
        paint(
          options.color,
          90,
          `\n${result.path}: ${result.parseErrors.length} line${result.parseErrors.length === 1 ? "" : "s"} could not be parsed; findings for this file may be incomplete.`,
        ),
      );
    }

    const diagnostics = results.flatMap((r) => ("diagnostics" in r ? r.diagnostics : []));
    if (options.impactSummary) {
      const summary = formatImpactSummary(diagnostics);
      if (summary) console.log(`\n${summary}`);
    }
    const counts = { error: 0, warning: 0, suggestion: 0, info: 0 } satisfies Record<Severity, number>;
    for (const d of diagnostics) counts[d.severity]++;
    const total = diagnostics.length;
    if (total) {
      const totalGroups = [];
      const color = options.color;
      const errorCoount = counts.error;
      if (errorCoount) {
        totalGroups.push(paint(color, 31, `${errorCoount} error${errorCoount > 1 ? "s" : ""}`));
      }
      if (counts.warning) {
        totalGroups.push(paint(color, 33, `${counts.warning} warning${counts.warning > 1 ? "s" : ""}`));
      }
      if (counts.suggestion) {
        totalGroups.push(paint(color, 36, `${counts.suggestion} suggestion${counts.suggestion > 1 ? "s" : ""}`));
      }
      if (counts.info) {
        totalGroups.push(paint(color, 90, `${counts.info} info`));
      }
      console.log(`\n\n${total} issue${total === 1 ? "" : "s"}: ${totalGroups.join(", ")}`);
    }
  }

  const allDiagnostics = results.flatMap((r) => ("diagnostics" in r ? r.diagnostics : []));
  // A file this parser cannot read is not a lint failure. The assembler decides
  // what is valid syntax, and its grammar is the narrower one.
  return ioFailed || failsThreshold(allDiagnostics, options.failOn) ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(`m68k-lint: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
    process.exitCode = 2;
  });
