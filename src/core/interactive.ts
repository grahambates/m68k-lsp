import type { Diagnostic } from "./diagnostic.js";

/**
 * What to do with one finding.
 *
 * `acknowledge` and `ignore` both write a suppression comment and differ only
 * in what it says: one records that the code was looked at and is meant to be
 * this way, the other that the finding is not wanted here. Keeping them apart
 * matters when someone reads the file later — "checked, intentional" and "not
 * interested" are different claims, and only the first is evidence.
 */
export type Decision = "apply" | "skip" | "acknowledge" | "ignore" | "quit";

export interface InteractiveResult {
  output: string;
  applied: Diagnostic[];
  suppressed: Diagnostic[];
  /** True when the review was ended early; decisions already made still stand. */
  quit: boolean;
}

const REASONS: Record<"acknowledge" | "ignore", string> = {
  acknowledge: "reviewed: intentional",
  ignore: "ignored",
};

/** The indentation of a line, so an inserted directive lines up with the code. */
function indentOf(line: string | undefined): string {
  if (line === undefined) return "";
  const leading = /^[ \t]+/.exec(line)?.[0];
  if (leading) return leading;
  return /^\S+([ \t]+)(?=\S)/.exec(line)?.[1] ?? "";
}

function suppressionFor(diagnostic: Diagnostic, indent: string, decision: "acknowledge" | "ignore"): string {
  return `${indent}; m68k-lint-disable-next-line ${diagnostic.ruleId} -- ${REASONS[decision]}`;
}

/**
 * Walk the findings, asking about each, then edit.
 *
 * Asked in file order, because that is how a person reads, and edited
 * afterwards from the bottom up, because that is the only order in which line
 * numbers stay valid. Separating the two also means a decision is never taken
 * against text that has already shifted under it.
 *
 * A finding overlapping one already acted on is left alone: the edit it was
 * decided against no longer exists. Running again picks it up against the file
 * as it now stands.
 */
export async function runInteractive(
  source: string,
  diagnostics: readonly Diagnostic[],
  decide: (diagnostic: Diagnostic) => Promise<Decision>,
): Promise<InteractiveResult> {
  const reviewable = diagnostics
    .filter((diagnostic) => diagnostic.span !== undefined)
    .slice()
    .sort((a, b) => a.span!.startLine - b.span!.startLine);

  const decisions: { diagnostic: Diagnostic; decision: Exclude<Decision, "skip" | "quit"> }[] = [];
  let quit = false;
  for (const diagnostic of reviewable) {
    const decision = await decide(diagnostic);
    if (decision === "quit") {
      quit = true;
      break;
    }
    if (decision === "skip") continue;
    decisions.push({ diagnostic, decision });
  }

  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const applied: Diagnostic[] = [];
  const suppressed: Diagnostic[] = [];
  let lowestTouched = Number.POSITIVE_INFINITY;

  for (const { diagnostic, decision } of decisions.slice().sort((a, b) => b.diagnostic.span!.startLine - a.diagnostic.span!.startLine)) {
    const { startLine, endLine } = diagnostic.span!;
    if (endLine >= lowestTouched) continue;

    if (decision === "apply") {
      const replacement = diagnostic.suggestion?.replacement;
      if (replacement === undefined) continue;
      lines.splice(startLine - 1, endLine - startLine + 1, ...(replacement === "" ? [] : replacement.split("\n")));
      applied.push(diagnostic);
    } else {
      lines.splice(startLine - 1, 0, suppressionFor(diagnostic, indentOf(lines[startLine - 1]), decision));
      suppressed.push(diagnostic);
    }
    lowestTouched = startLine;
  }

  return { output: lines.join("\n"), applied: applied.reverse(), suppressed: suppressed.reverse(), quit };
}
