import * as lsp from "vscode-languageserver";
import { Provider } from ".";
import { Context } from "../context";
import { isProcessed } from "../DocumentProcessor";
import {
  analyzeRegisterUsage,
  canonicalGeneralPurposeRegister,
  findRoutineRange,
  registerRanges,
  RegisterUsageParams,
  RegisterUsageResult,
  RegisterUsageReference,
  RoutineRangeParams,
  RoutineRangeResult,
} from "../registerAnalysis";

export interface RegisterSwapParams extends RegisterUsageParams {
  documentVersion: number;
  registers: [string, string];
}

export interface RegisterRemapParams extends RegisterUsageParams {
  documentVersion: number;
  mappings: Record<string, string>;
}

export type RegisterSwapError =
  | "invalid-registers"
  | "stale-document"
  | "unsupported-reference"
  | "analysis-incomplete";

export type RegisterRemapError =
  | "analysis-incomplete"
  | "invalid-mappings"
  | "mapping-conflict"
  | "stale-document"
  | "unsupported-reference";

export interface RegisterSwapResult {
  documentVersion: number;
  edits: lsp.TextEdit[];
  error?: RegisterSwapError;
  unsupported?: RegisterUsageReference[];
}

export interface RegisterRemapResult {
  documentVersion: number;
  edits: lsp.TextEdit[];
  error?: RegisterRemapError;
  conflicts?: string[];
  unsupported?: RegisterUsageReference[];
}

export default class RegisterProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  register(connection: lsp.Connection) {
    connection.onRequest("m68k/registerRanges", ({ uri }: { uri: string }) =>
      registerRanges(this.ctx, uri),
    );
    connection.onRequest("m68k/registerUsage", this.onRegisterUsage.bind(this));
    connection.onRequest("m68k/registerSwap", this.onRegisterSwap.bind(this));
    connection.onRequest("m68k/registerRemap", this.onRegisterRemap.bind(this));
    connection.onRequest("m68k/routineRange", this.onRoutineRange.bind(this));
    return {};
  }

  onRegisterUsage(
    params: RegisterUsageParams,
  ): RegisterUsageResult | undefined {
    return analyzeRegisterUsage(this.ctx, params);
  }

  onRoutineRange(params: RoutineRangeParams): RoutineRangeResult | undefined {
    return findRoutineRange(this.ctx, params);
  }

  onRegisterSwap(params: RegisterSwapParams): RegisterSwapResult | undefined {
    const document = this.ctx.store.get(params.textDocument.uri);
    if (!isProcessed(document)) {
      return;
    }
    if (document.document.version !== params.documentVersion) {
      return {
        documentVersion: document.document.version,
        edits: [],
        error: "stale-document",
      };
    }

    const first = canonicalGeneralPurposeRegister(params.registers[0]);
    const second = canonicalGeneralPurposeRegister(params.registers[1]);
    if (!first || !second || first === second) {
      return {
        documentVersion: document.document.version,
        edits: [],
        error: "invalid-registers",
      };
    }
    const registers: [string, string] = [first, second];

    const usage = this.onRegisterUsage(params);
    if (!usage) {
      return;
    }
    if (usage.incomplete) {
      return {
        documentVersion: document.document.version,
        edits: [],
        error: "analysis-incomplete",
      };
    }
    const byName = new Map(usage.registers.map((item) => [item.name, item]));
    const selected = registers.flatMap(
      (register) => byName.get(register)?.references ?? [],
    );
    const unsupported = selected.filter(({ kind }) => kind !== "explicit");
    if (unsupported.length) {
      return {
        documentVersion: document.document.version,
        edits: [],
        error: "unsupported-reference",
        unsupported,
      };
    }

    const edits = registers.flatMap((register, index) => {
      const replacement = registers[index === 0 ? 1 : 0]!;
      return (byName.get(register)?.references ?? []).map((reference) =>
        lsp.TextEdit.replace(
          reference.range,
          matchRegisterCase(reference.spelling, replacement),
        ),
      );
    });
    return {
      documentVersion: document.document.version,
      edits: uniqueEdits(edits),
    };
  }

  onRegisterRemap(
    params: RegisterRemapParams,
  ): RegisterRemapResult | undefined {
    const document = this.ctx.store.get(params.textDocument.uri);
    if (!isProcessed(document)) {
      return;
    }
    if (document.document.version !== params.documentVersion) {
      return {
        documentVersion: document.document.version,
        edits: [],
        error: "stale-document",
      };
    }

    const mappings = new Map<string, string>();
    for (const [rawSource, rawDestination] of Object.entries(params.mappings)) {
      const source = canonicalGeneralPurposeRegister(rawSource);
      const destination = canonicalGeneralPurposeRegister(rawDestination);
      if (!source || !destination) {
        return {
          documentVersion: document.document.version,
          edits: [],
          error: "invalid-mappings",
        };
      }
      if (source !== destination) {
        mappings.set(source, destination);
      }
    }
    if (!mappings.size) {
      return {
        documentVersion: document.document.version,
        edits: [],
        error: "invalid-mappings",
      };
    }

    const usage = this.onRegisterUsage(params);
    if (!usage) {
      return;
    }
    if (usage.incomplete) {
      return {
        documentVersion: document.document.version,
        edits: [],
        error: "analysis-incomplete",
      };
    }
    const byName = new Map(usage.registers.map((item) => [item.name, item]));

    const references = Array.from(mappings.keys()).flatMap(
      (source) => byName.get(source)?.references ?? [],
    );
    const unsupported = references.filter(({ kind }) => kind !== "explicit");
    if (unsupported.length) {
      return {
        documentVersion: document.document.version,
        edits: [],
        error: "unsupported-reference",
        unsupported,
      };
    }

    const edits = Array.from(mappings, ([source, destination]) =>
      (byName.get(source)?.references ?? []).map((reference) =>
        lsp.TextEdit.replace(
          reference.range,
          matchRegisterCase(reference.spelling, destination),
        ),
      ),
    ).flat();
    return {
      documentVersion: document.document.version,
      edits: uniqueEdits(edits),
    };
  }
}

function matchRegisterCase(spelling: string, register: string): string {
  return spelling === spelling.toUpperCase()
    ? register.toUpperCase()
    : register.toLowerCase();
}

function uniqueEdits(edits: lsp.TextEdit[]): lsp.TextEdit[] {
  return Array.from(
    new Map(edits.map((edit) => [JSON.stringify(edit), edit])).values(),
  );
}
