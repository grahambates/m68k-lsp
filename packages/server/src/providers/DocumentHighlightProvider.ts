import * as lsp from "vscode-languageserver";
import type { ParsedLine } from "m68k-parser";
import { Provider } from ".";
import { AstNode, nodeAtPosition, walkFile } from "../ast";
import { Context } from "../context";
import { isProcessed } from "../DocumentProcessor";
import { locationAsRange } from "../geometry";
import { symbolAtPosition } from "../symbols";

const registerNodeTypes = new Set([
  "data-register",
  "address-register",
  "special-register",
  "fpu-data-register",
  "fpu-control-register",
]);

const generalPurposeRegisters = new Set([
  "d0",
  "d1",
  "d2",
  "d3",
  "d4",
  "d5",
  "d6",
  "d7",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
]);

const readOnlyDestinations = new Set([
  "btst",
  "chk",
  "chk2",
  "cmp",
  "cmp2",
  "cmpa",
  "cmpi",
  "cmpm",
  "jmp",
  "jsr",
  "pea",
  "tst",
]);

const writeOnlyDestinations = new Set([
  "clr",
  "lea",
  "move",
  "movea",
  "moveq",
  "sf",
  "st",
  "scc",
  "scs",
  "seq",
  "sge",
  "sgt",
  "shi",
  "sle",
  "sls",
  "slt",
  "smi",
  "sne",
  "spl",
  "svc",
  "svs",
]);

export type RegisterAccess = "read" | "write" | "readwrite" | "unknown";

export interface RegisterUsageReference {
  range: lsp.Range;
  spelling: string;
  kind: "explicit" | "register-list";
  access: RegisterAccess;
}

export interface RegisterUsage {
  name: string;
  references: RegisterUsageReference[];
  read: boolean;
  written: boolean;
  input?: boolean;
}

export interface RegisterUsageResult {
  documentVersion: number;
  registers: RegisterUsage[];
}

export interface RegisterUsageParams {
  textDocument: lsp.TextDocumentIdentifier;
  range: lsp.Range;
}

export default class DocumentHighlightProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onDocumentHighlight({
    textDocument,
    position,
  }: lsp.DocumentHighlightParams): Promise<
    lsp.DocumentHighlight[] | undefined
  > {
    const { store: processed } = this.ctx;
    const document = processed.get(textDocument.uri);
    const docSymbols = document?.symbols;
    if (!docSymbols) {
      return;
    }

    if (isProcessed(document)) {
      const path = nodeAtPosition(document.parsed, position);
      const register = path && registerName(path.node);
      if (register) {
        return walkFile(document.parsed)
          .filter(({ node }) => registerName(node) === register)
          .map(({ node }) =>
            lsp.DocumentHighlight.create(
              locationAsRange(node.loc),
              lsp.DocumentHighlightKind.Read,
            ),
          );
      }
    }

    // Find reference or definition at position
    const foundSymbol = symbolAtPosition(docSymbols, position);
    if (!foundSymbol) {
      return [];
    }

    const results: lsp.DocumentHighlight[] = [];

    const refs = docSymbols.references.get(foundSymbol.name);
    if (refs) {
      for (const ref of refs) {
        results.push(
          lsp.DocumentHighlight.create(
            ref.location.range,
            lsp.DocumentHighlightKind.Read,
          ),
        );
      }
    }
    const def = docSymbols.definitions.get(foundSymbol.name);
    if (def) {
      results.push(
        lsp.DocumentHighlight.create(
          def.selectionRange,
          lsp.DocumentHighlightKind.Write,
        ),
      );
    }

    return results;
  }

  register(connection: lsp.Connection) {
    connection.onDocumentHighlight(this.onDocumentHighlight.bind(this));
    connection.onRequest("m68k/registerRanges", ({ uri }: { uri: string }) =>
      this.registerRanges(uri),
    );
    connection.onRequest("m68k/registerUsage", this.onRegisterUsage.bind(this));
    return {
      documentHighlightProvider: true,
    };
  }

  onRegisterUsage(
    params: RegisterUsageParams,
  ): RegisterUsageResult | undefined {
    const document = this.ctx.store.get(params.textDocument.uri);
    if (!isProcessed(document)) {
      return;
    }

    const usages = new Map<string, RegisterUsageReference[]>();
    for (const { node, line } of walkFile(document.parsed)) {
      const range = locationAsRange(node.loc);
      if (!rangesOverlap(params.range, range)) {
        continue;
      }

      const register = canonicalGeneralPurposeRegister(registerName(node));
      if (register) {
        addReference(usages, register, {
          range,
          spelling: document.document.getText(range),
          kind: "explicit",
          access: registerAccess(node, line),
        });
        continue;
      }

      if (node.type === "register-list") {
        const registers = (node as AstNode & { registers?: unknown }).registers;
        if (!Array.isArray(registers)) {
          continue;
        }
        const reference: RegisterUsageReference = {
          range,
          spelling: document.document.getText(range),
          kind: "register-list",
          access: registerAccess(node, line),
        };
        for (const item of registers) {
          const listed = canonicalGeneralPurposeRegister(item);
          if (listed) {
            addReference(usages, listed, reference);
          }
        }
      }
    }

    return {
      documentVersion: document.document.version,
      registers: Array.from(usages, ([name, references]) =>
        summariseUsage(name, references),
      ),
    };
  }

  private registerRanges(uri: string): Record<string, lsp.Range[]> {
    const document = this.ctx.store.get(uri);
    if (!isProcessed(document)) {
      return {};
    }

    const ranges: Record<string, lsp.Range[]> = {};
    for (const { node } of walkFile(document.parsed)) {
      const register = registerName(node);
      if (register) {
        (ranges[register] ??= []).push(locationAsRange(node.loc));
      }
    }
    return ranges;
  }
}

function registerName(node: AstNode) {
  const register = (node as AstNode & { register?: unknown }).register;
  if (!registerNodeTypes.has(node.type) || typeof register !== "string") {
    return;
  }
  return register.toLowerCase();
}

function canonicalGeneralPurposeRegister(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const register = value.toLowerCase() === "sp" ? "a7" : value.toLowerCase();
  return generalPurposeRegisters.has(register) ? register : undefined;
}

function addReference(
  usages: Map<string, RegisterUsageReference[]>,
  register: string,
  reference: RegisterUsageReference,
) {
  (usages.get(register) ?? usages.set(register, []).get(register)!).push(
    reference,
  );
}

function summariseUsage(
  name: string,
  references: RegisterUsageReference[],
): RegisterUsage {
  const firstAccess = references[0]?.access;
  return {
    name,
    references,
    read: references.some(({ access }) => includesRead(access)),
    written: references.some(({ access }) => includesWrite(access)),
    input:
      firstAccess === undefined || firstAccess === "unknown"
        ? undefined
        : includesRead(firstAccess),
  };
}

function registerAccess(node: AstNode, line: ParsedLine): RegisterAccess {
  const mnemonic =
    line.mnemonic?.type === "instruction"
      ? line.mnemonic.instruction.toLowerCase()
      : undefined;
  const operands = line.operands ?? [];
  const operandIndex = operands.findIndex((operand) =>
    containsLocation(operand.loc, node.loc),
  );
  if (!mnemonic || operandIndex < 0) {
    return "unknown";
  }

  const operand = operands[operandIndex] as AstNode;
  if (operand !== node) {
    return operand.type === "address-register-indirect-postinc" ||
      operand.type === "address-register-indirect-predec"
      ? "readwrite"
      : "read";
  }

  if (mnemonic === "movem" && node.type === "register-list") {
    return operandIndex === 0 ? "read" : "write";
  }
  if (mnemonic === "exg" || mnemonic === "link" || mnemonic.startsWith("db")) {
    return "readwrite";
  }
  if (operandIndex < operands.length - 1) {
    return "read";
  }
  if (readOnlyDestinations.has(mnemonic)) {
    return "read";
  }
  if (writeOnlyDestinations.has(mnemonic)) {
    return "write";
  }
  return "readwrite";
}

function containsLocation(
  container: AstNode["loc"],
  item: AstNode["loc"],
): boolean {
  return container.start <= item.start && item.end <= container.end;
}

function includesRead(access: RegisterAccess): boolean {
  return access === "read" || access === "readwrite";
}

function includesWrite(access: RegisterAccess): boolean {
  return access === "write" || access === "readwrite";
}

function rangesOverlap(left: lsp.Range, right: lsp.Range): boolean {
  return (
    comparePositions(left.start, right.end) < 0 &&
    comparePositions(right.start, left.end) < 0
  );
}

function comparePositions(left: lsp.Position, right: lsp.Position): number {
  return left.line - right.line || left.character - right.character;
}
