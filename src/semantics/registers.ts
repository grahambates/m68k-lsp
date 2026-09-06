import type { OperandNode, ParsedLine } from "m68k-parser";
import { getFlagSemantics } from "./flags.js";
import { semanticMnemonic } from "./mnemonics.js";

export const DATA_REGISTERS = ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"] as const;
export const ADDRESS_REGISTERS = ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"] as const;
export const REGISTERS = [...DATA_REGISTERS, ...ADDRESS_REGISTERS] as const;
export type Register = (typeof REGISTERS)[number];

export function normalizeRegister(register: string): Register | undefined {
  const r = register.toLowerCase() === "sp" ? "a7" : register.toLowerCase();
  return (REGISTERS as readonly string[]).includes(r) ? (r as Register) : undefined;
}

export interface RegisterSemantics {
  reads: ReadonlySet<Register>;
  writes: ReadonlySet<Register>;
  /** True when the instruction may read/write registers we have not modelled. */
  unknownEffects: boolean;
  call: boolean;
}

const none = () => new Set<Register>();

function addRegister(set: Set<Register>, node: unknown): void {
  if (!node || typeof node !== "object" || !("type" in node)) return;
  const n = node as { type: string; register?: string };
  if ((n.type === "data-register" || n.type === "address-register") && n.register) {
    const r = normalizeRegister(n.register);
    if (r) set.add(r);
  }
}

/** Registers needed to evaluate an operand/effective address. */
export function registersReadByOperand(op: OperandNode | undefined): ReadonlySet<Register> {
  const result = new Set<Register>();
  if (!op) return result;
  switch (op.type) {
    case "data-register":
    case "address-register":
      addRegister(result, op);
      break;
    case "register-list":
      for (const register of op.registers) {
        const r = normalizeRegister(register);
        if (r) result.add(r);
      }
      break;
    case "address-register-indirect":
    case "address-register-indirect-postinc":
    case "address-register-indirect-predec":
    case "address-register-indirect-displacement":
      addRegister(result, op.register);
      break;
    case "address-register-indirect-index":
      addRegister(result, op.baseRegister);
      addRegister(result, op.indexRegister);
      break;
    case "pc-relative-index":
      addRegister(result, op.indexRegister);
      break;
    case "memory-indirect":
      addRegister(result, op.baseRegister);
      addRegister(result, op.indexRegister);
      break;
  }
  return result;
}

function directRegister(op: OperandNode | undefined): Register | undefined {
  if (op?.type !== "data-register" && op?.type !== "address-register") return undefined;
  return normalizeRegister(op.register);
}

function addAll(target: Set<Register>, source: ReadonlySet<Register>): void {
  for (const r of source) target.add(r);
}

function registersInList(op: OperandNode | undefined): ReadonlySet<Register> {
  const result = new Set<Register>();
  if (op?.type !== "register-list") return result;
  for (const name of op.registers) {
    const r = normalizeRegister(name);
    if (r) result.add(r);
  }
  return result;
}

function addEaSideEffectWrite(writes: Set<Register>, op: OperandNode | undefined): void {
  if (op?.type !== "address-register-indirect-postinc" && op?.type !== "address-register-indirect-predec") return;
  const r = normalizeRegister(op.register.type === "address-register" ? op.register.register : "");
  if (r) writes.add(r);
}

function computeRegisterSemantics(line: ParsedLine): RegisterSemantics {
  const mnemonic = semanticMnemonic(line);
  const reads = none();
  const writes = none();
  if (!mnemonic) return { reads, writes, unknownEffects: false, call: false };
  const ops = line.operands ?? [];
  const controlFlow = getFlagSemantics(line).controlFlow;
  const read = (i: number) => addAll(reads, registersReadByOperand(ops[i]));
  const writeDirect = (i: number) => {
    const r = directRegister(ops[i]);
    if (r) writes.add(r);
    else addEaSideEffectWrite(writes, ops[i]);
  };

  if (controlFlow === "call") {
    read(0);
    return { reads, writes, unknownEffects: true, call: true };
  }
  if (controlFlow === "dynamic-jump") {
    read(0);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (
    controlFlow === "return" ||
    controlFlow === "stop" ||
    controlFlow === "unconditional-branch" ||
    controlFlow === "conditional-branch"
  ) {
    if (mnemonic.startsWith("db")) {
      read(0);
      writeDirect(0);
    }
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (mnemonic === "nop") return { reads, writes, unknownEffects: false, call: false };

  if (["move", "movea"].includes(mnemonic)) {
    read(0);
    // Destination EA registers are read to form the address; a direct register is overwritten.
    if (!directRegister(ops[1])) read(1);
    writeDirect(1);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (mnemonic === "moveq") {
    writeDirect(1);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (mnemonic === "movem") {
    const leftList = ops[0]?.type === "register-list";
    const rightList = ops[1]?.type === "register-list";
    if (leftList === rightList) return { reads, writes, unknownEffects: true, call: false };

    if (leftList) {
      // Register list -> memory: listed registers are read; EA registers are read,
      // and predecrement/postincrement addressing updates its address register.
      addAll(reads, registersInList(ops[0]));
      read(1);
      addEaSideEffectWrite(writes, ops[1]);
    } else {
      // Memory -> register list: EA registers are read and listed registers are written.
      read(0);
      addEaSideEffectWrite(writes, ops[0]);
      addAll(writes, registersInList(ops[1]));
    }
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (mnemonic === "lea") {
    read(0);
    writeDirect(1);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (["clr", "not", "neg", "negx", "swap", "ext", "extb", "tas"].includes(mnemonic)) {
    // Memory EAs read address/index registers; direct registers are read only for read-modify-write ops.
    if (mnemonic !== "clr" && mnemonic !== "ext" && mnemonic !== "extb") read(0);
    else if (!directRegister(ops[0])) read(0);
    writeDirect(0);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (["tst"].includes(mnemonic)) {
    read(0);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (["cmp", "cmpa", "btst"].includes(mnemonic)) {
    read(0);
    read(1);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (
    [
      "add",
      "adda",
      "addq",
      "sub",
      "suba",
      "subq",
      "and",
      "or",
      "eor",
      "bchg",
      "bclr",
      "bset",
      "asl",
      "asr",
      "lsl",
      "lsr",
      "rol",
      "ror",
      "roxl",
      "roxr",
    ].includes(mnemonic)
  ) {
    read(0);
    read(1);
    writeDirect(1);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (["mulu", "muls", "divu", "divs"].includes(mnemonic)) {
    read(0);
    read(1);
    writeDirect(1);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (mnemonic === "exg") {
    read(0);
    read(1);
    writeDirect(0);
    writeDirect(1);
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (mnemonic === "link") {
    read(0);
    writeDirect(0);
    writes.add("a7");
    reads.add("a7");
    return { reads, writes, unknownEffects: false, call: false };
  }
  if (mnemonic === "unlk") {
    read(0);
    writes.add("a7");
    writeDirect(0);
    return { reads, writes, unknownEffects: false, call: false };
  }

  // Uncommon/system/FPU instructions are intentionally conservative for now.
  return { reads, writes, unknownEffects: true, call: false };
}

/**
 * Postincrement and predecrement update their address register whatever the
 * instruction is, so that is applied here rather than left to each branch above
 * to remember. Missing it made constant propagation believe an address register
 * still held its pre-increment value.
 */
export function getRegisterSemantics(line: ParsedLine): RegisterSemantics {
  const semantics = computeRegisterSemantics(line);
  if (semantics.unknownEffects) return semantics;

  const writes = new Set(semantics.writes);
  for (const op of line.operands ?? []) addEaSideEffectWrite(writes, op);
  return writes.size === semantics.writes.size ? semantics : { ...semantics, writes };
}
