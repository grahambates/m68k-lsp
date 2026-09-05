import type {
  AddressRegisterNode,
  DataRegisterNode,
  ExpressionNode,
  ImmediateNode,
  OperandNode,
  ParsedLine,
  Size,
} from "m68k-parser";
import { canonicalMnemonicName, instructionFamily, instructionFamilyName, semanticMnemonic } from "../semantics/mnemonics.js";

export function isInstruction(line: ParsedLine, mnemonic: string): boolean {
  return semanticMnemonic(line) === canonicalMnemonicName(mnemonic);
}

/** Match a broader semantic family, e.g. ADD/ADDI/ADDA when the rule explicitly supports it. */
export function isInstructionFamily(line: ParsedLine, mnemonic: string): boolean {
  return instructionFamily(line) === instructionFamilyName(mnemonic);
}

export function instructionSize(line: ParsedLine): Size | undefined {
  return line.qualifier?.type === "size" ? line.qualifier.size : undefined;
}

export function operand(line: ParsedLine, index: number): OperandNode | undefined {
  return line.operands?.[index];
}

export function immediateOperand(line: ParsedLine, index: number): ImmediateNode | undefined {
  const value = operand(line, index);
  return value?.type === "immediate" ? value : undefined;
}

export function dataRegisterOperand(line: ParsedLine, index: number): DataRegisterNode | undefined {
  const value = operand(line, index);
  return value?.type === "data-register" ? value : undefined;
}

export function addressRegisterOperand(line: ParsedLine, index: number): AddressRegisterNode | undefined {
  const value = operand(line, index);
  return value?.type === "address-register" ? value : undefined;
}

export function immediateExpressionOperand(line: ParsedLine, index: number): ExpressionNode | undefined {
  const immediate = immediateOperand(line, index);
  if (!immediate || immediate.value.type === "string-literal") return undefined;
  return immediate.value;
}

/** A -(An) operand with a concrete address register, not a symbol/macro placeholder. */
export function predecrementAddressRegister(
  line: ParsedLine,
  index: number,
): AddressRegisterNode | undefined {
  const value = operand(line, index);
  if (value?.type !== "address-register-indirect-predec") return undefined;
  return value.register.type === "address-register" ? value.register : undefined;
}

export function isAddqDestination(value: OperandNode | undefined, size?: Size): boolean {
  if (!value) return false;

  switch (value.type) {
    case "data-register":
      return true;
    case "address-register":
      return size !== "b";
    case "address-register-indirect":
    case "address-register-indirect-postinc":
    case "address-register-indirect-predec":
    case "address-register-indirect-displacement":
    case "address-register-indirect-index":
    case "memory-indirect":
    case "absolute-address":
      return true;
    default:
      return false;
  }
}
