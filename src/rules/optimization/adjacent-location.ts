import type { AddressRegisterIndirectDisplacementNode, OperandNode } from "m68k-parser";
import type { RuleContext } from "../../core/context.js";

/**
 * A memory location an adjacent-store peephole can compare across two
 * instructions: either a known absolute address, or a known displacement off
 * an address register whose identity we can pin down (a concrete register,
 * not one arriving through a macro parameter).
 */
export type Location =
  | { kind: "absolute"; value: number }
  | { kind: "register-displacement"; register: string; value: number };

function registerKey(register: AddressRegisterIndirectDisplacementNode["register"]): string | undefined {
  return register.type === "address-register" ? register.register : undefined;
}

/**
 * Read the location an operand writes to, when it is one of the two forms
 * these peepholes fold: `$addr` or `disp(An)` with a literal register. Symbol
 * or macro-parameter registers are excluded because there is no way to check
 * two of them name the same register without evaluating them as addresses,
 * which the parser does not offer.
 */
export function locationOf(ctx: RuleContext, op: OperandNode | undefined): Location | undefined {
  if (!op) return undefined;
  if (op.type === "absolute-address") {
    const result = ctx.evaluate(op.address);
    return result.known ? { kind: "absolute", value: result.value } : undefined;
  }
  if (op.type === "address-register-indirect-displacement") {
    const register = registerKey(op.register);
    if (!register) return undefined;
    const result = ctx.evaluate(op.displacement);
    return result.known ? { kind: "register-displacement", register, value: result.value } : undefined;
  }
  return undefined;
}

/** Whether `next` sits exactly `delta` bytes after `first`, in the same location form. */
export function isAdjacentLocation(first: Location, next: Location, delta: number): boolean {
  if (first.kind !== next.kind) return false;
  if (first.kind === "register-displacement" && next.kind === "register-displacement") {
    if (first.register !== next.register) return false;
  }
  return next.value === first.value + delta;
}
