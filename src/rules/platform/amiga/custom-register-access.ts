import type { ExpressionNode, OperandNode, ParsedLine } from "m68k-parser";
import type { Rule } from "../../../core/rule.js";
import type { RuleContext } from "../../../core/context.js";
import { canonicalMnemonic } from "../../../semantics/mnemonics.js";
import { operand } from "../../../util/ast.js";
import { evaluateConstant } from "../../../analysis/constants.js";
import { getRegisterSemantics, normalizeRegister, type Register } from "../../../semantics/registers.js";
import { semanticMnemonic } from "../../../semantics/mnemonics.js";

type Access = "read" | "write" | "readwrite";
type RegisterAccess = "read-only" | "write-only";

interface CustomRegister {
  name: string;
  access: RegisterAccess;
}

// Conservative initial subset from the Amiga Hardware Reference Manual's
// address-ordered register summary. This table is intentionally extensible;
// only registers whose access direction is unambiguous are listed here.
export const amigaCustomRegisters = new Map<number, CustomRegister>([
  [0xdff000, { name: "BLTDDAT", access: "read-only" }],
  [0xdff002, { name: "DMACONR", access: "read-only" }],
  [0xdff004, { name: "VPOSR", access: "read-only" }],
  [0xdff006, { name: "VHPOSR", access: "read-only" }],
  [0xdff008, { name: "DSKDATR", access: "read-only" }],
  [0xdff00a, { name: "JOY0DAT", access: "read-only" }],
  [0xdff00c, { name: "JOY1DAT", access: "read-only" }],
  [0xdff00e, { name: "CLXDAT", access: "read-only" }],
  [0xdff010, { name: "ADKCONR", access: "read-only" }],
  [0xdff012, { name: "POT0DAT", access: "read-only" }],
  [0xdff014, { name: "POT1DAT", access: "read-only" }],
  [0xdff016, { name: "POTGOR", access: "read-only" }],
  [0xdff018, { name: "SERDATR", access: "read-only" }],
  [0xdff01a, { name: "DSKBYTR", access: "read-only" }],
  [0xdff01c, { name: "INTENAR", access: "read-only" }],
  [0xdff01e, { name: "INTREQR", access: "read-only" }],

  [0xdff096, { name: "DMACON", access: "write-only" }],
  [0xdff09a, { name: "INTENA", access: "write-only" }],
  [0xdff09c, { name: "INTREQ", access: "write-only" }],
  [0xdff09e, { name: "ADKCON", access: "write-only" }],
  [0xdff100, { name: "BPLCON0", access: "write-only" }],
  [0xdff102, { name: "BPLCON1", access: "write-only" }],
  [0xdff104, { name: "BPLCON2", access: "write-only" }],
  [0xdff180, { name: "COLOR00", access: "write-only" }],
]);

const CUSTOM_BASE = 0xdff000;

// Canonical Amiga include-file symbols are commonly offsets from CUSTOM, not
// full absolute addresses. Keep this resolver local to the Amiga platform so
// external include files are not required merely to understand hardware EAs.
const amigaCustomSymbolValues = new Map<string, number>();
for (const [address, register] of amigaCustomRegisters) {
  amigaCustomSymbolValues.set(register.name.toLowerCase(), address - CUSTOM_BASE);
}
amigaCustomSymbolValues.set("custom", CUSTOM_BASE);

function evaluateAmigaExpression(ctx: RuleContext, expr: ExpressionNode): number | undefined {
  const result = evaluateConstant(expr, (name) => {
    const project = ctx.symbols.evaluate(name);
    if (project.known) return project.value;
    return amigaCustomSymbolValues.get(name.toLowerCase());
  });
  return result.known ? result.value : undefined;
}

function knownAddressRegisterBefore(ctx: RuleContext, lineIndex: number, register: Register): number | undefined {
  const known = ctx.registers.knownConstantBefore(lineIndex, register);
  if (known !== undefined) return known;

  // Platform symbols such as CUSTOM often come from an external include and
  // therefore are invisible to the generic symbol/register analysis. Recover
  // the common `LEA CUSTOM,An` idiom locally, stopping at the first write to An.
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = ctx.line(i);
    if (!line?.mnemonic || line.mnemonic.type !== "instruction") continue;
    const semantics = getRegisterSemantics(line);
    if (!semantics.writes.has(register)) continue;

    if (semanticMnemonic(line) === "lea") {
      const source = operand(line, 0);
      const dest = operand(line, 1);
      if (
        dest?.type === "address-register" &&
        normalizeRegister(dest.register) === register &&
        source?.type === "absolute-address"
      ) {
        const value = evaluateAmigaExpression(ctx, source.address);
        if (value !== undefined) return value >>> 0;
      }
    }
    return undefined;
  }
  return undefined;
}

function effectiveAddress(ctx: RuleContext, op: OperandNode | undefined, lineIndex: number): number | undefined {
  if (!op) return undefined;

  if (op.type === "absolute-address") {
    const value = evaluateAmigaExpression(ctx, op.address);
    return value === undefined ? undefined : value >>> 0;
  }

  if (op.type === "address-register-indirect") {
    if (op.register.type !== "address-register") return undefined;
    const register = normalizeRegister(op.register.register);
    if (!register) return undefined;
    return knownAddressRegisterBefore(ctx, lineIndex, register);
  }

  if (op.type === "address-register-indirect-displacement") {
    if (op.register.type !== "address-register") return undefined;
    const register = normalizeRegister(op.register.register);
    if (!register) return undefined;
    const base = knownAddressRegisterBefore(ctx, lineIndex, register);
    const displacement = evaluateAmigaExpression(ctx, op.displacement);
    if (base === undefined || displacement === undefined) return undefined;
    return (base + displacement) >>> 0;
  }

  return undefined;
}

function operandAccess(line: ParsedLine, index: number): Access | undefined {
  const mnemonic = canonicalMnemonic(line);
  if (!mnemonic) return undefined;

  if (mnemonic === "move" || mnemonic === "movea")
    return index === 0 ? "read" : mnemonic === "move" && index === 1 ? "write" : undefined;
  if (["cmp", "cmpa", "tst", "btst"].includes(mnemonic)) return "read";
  if (["clr", "not", "neg", "negx", "nbcd", "tas"].includes(mnemonic)) return index === 0 ? "readwrite" : undefined;
  if (["bchg", "bclr", "bset"].includes(mnemonic)) return index === 1 ? "readwrite" : undefined;
  if (["add", "adda", "sub", "suba", "and", "or", "eor"].includes(mnemonic))
    return index === 0 ? "read" : index === 1 ? "readwrite" : undefined;
  return undefined;
}

function violates(expected: RegisterAccess, actual: Access): boolean {
  return expected === "read-only" ? actual !== "read" : actual !== "write";
}

export const amigaCustomRegisterAccess: Rule = {
  meta: {
    id: "correctness/amiga-custom-register-access",
    category: "correctness",
    defaultSeverity: "warning",
    platforms: ["amiga"],
    description: "Check read/write direction for Amiga custom-chip registers",
    tags: ["amiga", "hardware", "custom-registers"],
    docs: {
      source: "Amiga Hardware Reference Manual",
      note: "Custom-chip registers are read-only or write-only and must be accessed using the documented direction.",
    },
  },
  checkLine(ctx, line, lineIndex) {
    for (let index = 0; index < (line.operands?.length ?? 0); index++) {
      const op = operand(line, index);
      const address = effectiveAddress(ctx, op, lineIndex);
      if (address === undefined) continue;
      const register = amigaCustomRegisters.get(address);
      if (!register) continue;
      const access = operandAccess(line, index);
      if (!access || !violates(register.access, access)) continue;

      const action = access === "read" ? "read" : access === "write" ? "write" : "read/modify/write";
      ctx.report({
        ruleId: this.meta.id,
        category: this.meta.category,
        severity: this.meta.defaultSeverity,
        confidence: "certain",
        message: `${action} access to ${register.access} Amiga register ${register.name}`,
        loc: op?.loc ?? line.mnemonic!.loc,
        notes: [
          {
            message: `${register.name} at $${address.toString(16).toUpperCase()} is documented as ${register.access}.`,
          },
        ],
      });
    }
  },
};
