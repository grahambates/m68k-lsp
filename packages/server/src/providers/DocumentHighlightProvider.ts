import * as lsp from "vscode-languageserver";
import { parseLine } from "m68k-parser";
import type { Block, ParsedLine } from "m68k-parser";
import { Provider } from ".";
import { AstNode, nodeAtPosition, walkFile, walkLine } from "../ast";
import { Context } from "../context";
import { isProcessed, MacroDefinition } from "../DocumentProcessor";
import { getUnitFilesByDistance } from "../files";
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
  kind: "explicit" | "register-list" | "macro-expansion";
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

export interface RoutineRangeParams {
  textDocument: lsp.TextDocumentIdentifier;
  position: lsp.Position;
}

export interface RegisterSwapParams extends RegisterUsageParams {
  documentVersion: number;
  registers: [string, string];
}

export type RegisterSwapError =
  "invalid-registers" | "stale-document" | "unsupported-reference";

export interface RegisterSwapResult {
  documentVersion: number;
  edits: lsp.TextEdit[];
  error?: RegisterSwapError;
  unsupported?: RegisterUsageReference[];
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
    connection.onRequest("m68k/registerSwap", this.onRegisterSwap.bind(this));
    connection.onRequest("m68k/routineRange", this.onRoutineRange.bind(this));
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

      if (
        line.mnemonic?.type === "macro" &&
        findMacroDefinition(
          line.mnemonic.macro,
          params.textDocument.uri,
          this.ctx,
        )
      ) {
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

    const lineTexts = document.document.getText().split(/\r?\n/g);
    const macroDefinitionLines = collectMacroDefinitionLines(
      document.blocks.blocks,
    );
    for (const [index, line] of document.parsed.lines.entries()) {
      if (line.mnemonic?.type !== "macro" || macroDefinitionLines.has(index)) {
        continue;
      }
      const callRange = locationAsRange(line.mnemonic.loc);
      if (!rangesOverlap(params.range, callRange)) {
        continue;
      }
      const definition = findMacroDefinition(
        line.mnemonic.macro,
        params.textDocument.uri,
        this.ctx,
      );
      if (!definition) {
        continue;
      }
      const lineText = lineTexts[index] ?? "";
      const arguments_ = (line.operands ?? []).map((operand) => ({
        text: lineText.slice(operand.loc.start, operand.loc.end),
        sourceRange: locationAsRange(operand.loc),
      }));
      expandMacro(
        definition,
        {
          arguments: arguments_,
          qualifier: line.qualifier
            ? {
                text: lineText.slice(
                  line.qualifier.loc.start,
                  line.qualifier.loc.end,
                ),
                sourceRange: locationAsRange(line.qualifier.loc),
              }
            : undefined,
          carg: 1,
        },
        callRange,
        params.textDocument.uri,
        this.ctx,
        usages,
      );
    }

    return {
      documentVersion: document.document.version,
      registers: Array.from(usages, ([name, references]) =>
        summariseUsage(name, references),
      ),
    };
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
    return { documentVersion: document.document.version, edits };
  }

  onRoutineRange(params: RoutineRangeParams): lsp.Range | undefined {
    const document = this.ctx.store.get(params.textDocument.uri);
    if (!isProcessed(document)) {
      return;
    }

    let startLine: number | undefined;
    for (
      let index = Math.min(
        params.position.line,
        document.parsed.lines.length - 1,
      );
      index >= 0;
      index--
    ) {
      const label = document.parsed.lines[index].label;
      if (label && label.scope !== "local") {
        startLine = index;
        break;
      }
    }
    if (startLine === undefined) {
      return;
    }

    for (
      let index = params.position.line;
      index < document.parsed.lines.length;
      index++
    ) {
      const line = document.parsed.lines[index];
      if (
        index > params.position.line &&
        line.label &&
        line.label.scope !== "local"
      ) {
        return;
      }
      const mnemonic = line.mnemonic;
      if (
        mnemonic?.type === "instruction" &&
        mnemonic.instruction.toLowerCase() === "rts"
      ) {
        return lsp.Range.create(
          lsp.Position.create(startLine, 0),
          lsp.Position.create(index, mnemonic.loc.end),
        );
      }
    }
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

function matchRegisterCase(spelling: string, register: string): string {
  return spelling === spelling.toUpperCase()
    ? register.toUpperCase()
    : register.toLowerCase();
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

interface MacroArgument {
  text: string;
  sourceRange?: lsp.Range;
}

interface MacroInvocation {
  arguments: MacroArgument[];
  qualifier?: MacroArgument;
  carg: number;
}

interface ExpansionSpan {
  start: number;
  end: number;
  sourceRange: lsp.Range;
}

interface ExpandedLine {
  text: string;
  spans: ExpansionSpan[];
}

interface ExpansionState {
  depth: number;
  remainingLines: number;
  stack: Set<MacroDefinition>;
}

function collectMacroDefinitionLines(blocks: Block[]): Set<number> {
  const lines = new Set<number>();
  const visit = (items: Block[]) => {
    for (const block of items) {
      if (block.kind === "macro" && block.end !== undefined) {
        for (let index = block.start; index <= block.end; index++) {
          lines.add(index);
        }
      }
      visit(block.children);
    }
  };
  visit(blocks);
  return lines;
}

function findMacroDefinition(
  name: string,
  documentUri: string,
  ctx: Context,
): MacroDefinition | undefined {
  const key = name.toLowerCase();
  for (const uri of [
    documentUri,
    ...getUnitFilesByDistance(documentUri, ctx),
  ]) {
    const definition = ctx.store.get(uri)?.macros.get(key);
    if (definition) {
      return definition;
    }
  }
}

function expandMacro(
  definition: MacroDefinition,
  invocation: MacroInvocation,
  callRange: lsp.Range,
  documentUri: string,
  ctx: Context,
  usages: Map<string, RegisterUsageReference[]>,
  state: ExpansionState = {
    depth: 0,
    remainingLines: 1000,
    stack: new Set(),
  },
) {
  if (
    state.depth >= 10 ||
    state.remainingLines <= 0 ||
    state.stack.has(definition)
  ) {
    return;
  }

  state.stack.add(definition);
  state.depth++;
  for (const bodyLine of definition.body) {
    if (state.remainingLines-- <= 0) {
      break;
    }
    const expanded = substituteMacroParameters(bodyLine, invocation);
    const line = parseLine(expanded.text).value;
    addExpandedRegisters(line, expanded, callRange, usages);

    if (line.mnemonic?.type === "macro") {
      const nested = findMacroDefinition(line.mnemonic.macro, documentUri, ctx);
      if (nested) {
        const nestedArguments = (line.operands ?? []).map((operand) => ({
          text: expanded.text.slice(operand.loc.start, operand.loc.end),
          sourceRange:
            sourceRangeForLocation(operand.loc, expanded.spans) ?? callRange,
        }));
        expandMacro(
          nested,
          {
            arguments: nestedArguments,
            qualifier: line.qualifier
              ? {
                  text: expanded.text.slice(
                    line.qualifier.loc.start,
                    line.qualifier.loc.end,
                  ),
                  sourceRange: sourceRangeForLocation(
                    line.qualifier.loc,
                    expanded.spans,
                  ),
                }
              : undefined,
            carg: 1,
          },
          callRange,
          documentUri,
          ctx,
          usages,
          state,
        );
      }
    }
  }
  state.depth--;
  state.stack.delete(definition);
}

function substituteMacroParameters(
  text: string,
  invocation: MacroInvocation,
): ExpandedLine {
  let output = "";
  let cursor = 0;
  const spans: ExpansionSpan[] = [];
  const pattern = /\\(\?([1-9a-z])|[0-9a-z#.+-])|\b(NARG|CARG)\b/gi;
  for (const match of text.matchAll(pattern)) {
    const start = match.index;
    output += text.slice(cursor, start);
    const substitution = macroSubstitution(match, invocation);
    const replacementStart = output.length;
    output += substitution?.text ?? match[0];
    if (substitution?.sourceRange) {
      spans.push({
        start: replacementStart,
        end: output.length,
        sourceRange: substitution.sourceRange,
      });
    }
    cursor = start + match[0].length;
  }
  output += text.slice(cursor);
  return { text: output, spans };
}

function macroSubstitution(
  match: RegExpMatchArray,
  invocation: MacroInvocation,
): MacroArgument | undefined {
  const builtin = match[3]?.toUpperCase();
  if (builtin === "NARG" || match[1] === "#") {
    return { text: String(invocation.arguments.length) };
  }
  if (builtin === "CARG") {
    return { text: String(invocation.carg) };
  }

  const parameter = match[1];
  if (parameter === "0") {
    return invocation.qualifier ?? { text: "" };
  }
  if (parameter === "." || parameter === "+" || parameter === "-") {
    const argument = invocation.arguments[invocation.carg - 1] ?? { text: "" };
    if (parameter === "+") {
      invocation.carg++;
    } else if (parameter === "-") {
      invocation.carg--;
    }
    return argument;
  }

  const query = match[2];
  if (query) {
    const index = macroArgumentIndex(query);
    return {
      text: String(
        index === undefined
          ? 0
          : (invocation.arguments[index]?.text.length ?? 0),
      ),
    };
  }
  const index = macroArgumentIndex(parameter);
  return index === undefined ? undefined : invocation.arguments[index];
}

function macroArgumentIndex(parameter: string): number | undefined {
  if (/^[1-9]$/.test(parameter)) {
    return Number(parameter) - 1;
  }
  if (/^[a-z]$/i.test(parameter)) {
    return parameter.toLowerCase().charCodeAt(0) - "a".charCodeAt(0) + 9;
  }
}

function addExpandedRegisters(
  line: ParsedLine,
  expanded: ExpandedLine,
  callRange: lsp.Range,
  usages: Map<string, RegisterUsageReference[]>,
) {
  for (const node of walkLine(line)) {
    const register = canonicalGeneralPurposeRegister(registerName(node));
    if (register) {
      addReference(usages, register, {
        range: sourceRangeForLocation(node.loc, expanded.spans) ?? callRange,
        spelling: expanded.text.slice(node.loc.start, node.loc.end),
        kind: "macro-expansion",
        access: registerAccess(node, line),
      });
      continue;
    }
    if (node.type !== "register-list") {
      continue;
    }
    const registers = (node as AstNode & { registers?: unknown }).registers;
    if (!Array.isArray(registers)) {
      continue;
    }
    const reference: RegisterUsageReference = {
      range: sourceRangeForLocation(node.loc, expanded.spans) ?? callRange,
      spelling: expanded.text.slice(node.loc.start, node.loc.end),
      kind: "macro-expansion",
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

function sourceRangeForLocation(
  location: AstNode["loc"],
  spans: ExpansionSpan[],
): lsp.Range | undefined {
  return spans.find(
    (span) => location.start < span.end && span.start < location.end,
  )?.sourceRange;
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
