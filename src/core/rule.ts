import type { ParsedLine } from "m68k-parser";
import type { RuleContext } from "./context.js";
import type { RuleCategory, Severity } from "./diagnostic.js";
import type { Platform, RulePreset } from "./config.js";

export interface RuleMeta {
  id: string;
  category: RuleCategory;
  defaultSeverity: Severity;
  enabledByDefault?: boolean;
  /** Presets which opt this rule in when it is otherwise disabled by default. */
  presets?: RulePreset[];
  /** If present, this rule only runs for these platform modes. */
  platforms?: Platform[];
  description: string;
  tags?: string[];
  docs?: {
    source?: string;
    note?: string;
  };
}

export interface Rule {
  meta: RuleMeta;
  checkLine?(ctx: RuleContext, line: ParsedLine, index: number): void;
  checkFile?(ctx: RuleContext): void;
}
