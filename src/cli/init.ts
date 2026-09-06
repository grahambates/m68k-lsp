import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { OptimizationGoal, Platform, Processor } from "../core/config.js";

export const initConfigFileName = "m68k-lint.json";

/**
 * The questions are asked through this rather than readline directly, so the
 * flow can be driven by a test without a terminal.
 */
export interface Prompt {
  choice<T extends string>(question: string, choices: readonly T[], fallback: T): Promise<T>;
  list(question: string, fallback: readonly string[]): Promise<string[]>;
  confirm(question: string, fallback: boolean): Promise<boolean>;
}

export interface InitAnswers {
  platform: Platform;
  processors: Processor[];
  goal: OptimizationGoal;
  style: boolean;
  files: string[];
  ignores: string[];
}

const PLATFORMS: readonly Platform[] = ["generic", "amiga", "atari"];
const PROCESSORS: readonly Processor[] = ["mc68000", "mc68010", "mc68020", "mc68030", "mc68040", "mc68060", "cpu32"];
const GOALS: readonly OptimizationGoal[] = ["balanced", "speed", "size"];

/** Suggest source globs from what is actually on disk, rather than guessing. */
export async function detectSourceGlobs(root: string): Promise<string[]> {
  const candidates = ["src", "source", "sources", "asm", "code"];
  const found: string[] = [];
  for (const name of candidates) {
    try {
      if ((await stat(join(root, name))).isDirectory()) found.push(`${name}/**`);
    } catch {
      // Not present; nothing to suggest from it.
    }
  }
  return found.length ? found : ["**"];
}

export async function collectInitAnswers(prompt: Prompt, detectedFiles: readonly string[]): Promise<InitAnswers> {
  const platform = await prompt.choice("Target platform", PLATFORMS, "generic");
  const processors = (await prompt.list(`Target processor(s), comma separated (${PROCESSORS.join(", ")})`, [
    "mc68000",
  ])) as Processor[];
  const goal = await prompt.choice("Optimization goal", GOALS, "balanced");
  const style = await prompt.confirm("Enable the opt-in style preset?", false);
  const files = await prompt.list("Source globs to lint", detectedFiles);
  const ignores = await prompt.list("Globs to ignore (blank for none)", []);

  return { platform, processors, goal, style, files, ignores };
}

export function validateProcessors(values: readonly string[]): Processor[] {
  const unknown = values.filter((value) => !PROCESSORS.includes(value as Processor));
  if (unknown.length)
    throw new Error(`Unknown processor(s): ${unknown.join(", ")}. Expected: ${PROCESSORS.join(", ")}`);
  if (!values.length) throw new Error("At least one processor is required");
  return [...values] as Processor[];
}

/**
 * Only non-default values are written. A config full of restated defaults is
 * noise, and it silently pins behaviour the user never chose.
 */
export function renderInitConfig(answers: InitAnswers): string {
  const config: Record<string, unknown> = {
    $schema: "./node_modules/m68k-lint/m68k-lint.schema.json",
  };
  if (answers.platform !== "generic") config.platform = answers.platform;
  if (answers.processors.length !== 1 || answers.processors[0] !== "mc68000") config.processors = answers.processors;
  if (answers.goal !== "balanced") config.goal = answers.goal;
  if (answers.style) config.presets = ["recommended", "style"];
  if (answers.files.length) config.files = answers.files;
  if (answers.ignores.length) config.ignores = answers.ignores;
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** A one-line summary of what the generated config actually turns on. */
export function describeInitConfig(answers: InitAnswers): string {
  const parts = [
    `platform ${answers.platform}`,
    `cpu ${answers.processors.join(",")}`,
    `goal ${answers.goal}`,
    answers.style ? "style preset on" : "style preset off",
  ];
  return parts.join(", ");
}

/** Ignore globs need a trailing /** to match files inside a directory. */
export function normalizeIgnoreGlobs(values: readonly string[]): string[] {
  return values.map((value) => (/[*?[\]]/.test(value) ? value : `${value.replace(/\/+$/, "")}/**`));
}

/**
 * Wraps a readline interface as a Prompt. Takes the minimal shape it needs
 * rather than the interface type, so a test can drive it with a fake.
 */
export function terminalPrompt(rl: { question: (query: string) => Promise<string> }): Prompt {
  const askLine = async (question: string, shown: string) => (await rl.question(`${question} ${shown}: `)).trim();
  return {
    async choice(question, choices, fallback) {
      for (;;) {
        const answer = await askLine(`${question} (${choices.join(", ")})`, `[${fallback}]`);
        if (!answer) return fallback;
        if ((choices as readonly string[]).includes(answer)) return answer as typeof fallback;
        console.error(`  Expected one of: ${choices.join(", ")}`);
      }
    },
    async list(question, fallback) {
      const answer = await askLine(question, `[${fallback.join(", ") || "none"}]`);
      if (!answer) return [...fallback];
      return answer
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    },
    async confirm(question, fallback) {
      const answer = await askLine(question, fallback ? "[Y/n]" : "[y/N]");
      if (!answer) return fallback;
      return /^y(es)?$/i.test(answer);
    },
  };
}
