import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, immediateOperand, instructionSize, isInstructionFamily } from "../../util/ast.js";

function makeAddressImmediateLea(mnemonic: "add" | "sub"): Rule {
  const id = mnemonic === "add" ? "optimization/address-add-to-lea" : "optimization/address-sub-to-lea";
  return {
    meta: {
      id,
      category: "optimization",
      defaultSeverity: "suggestion",
      description: `Use LEA for ${mnemonic.toUpperCase()} immediate to an address register`,
      tags: ["asp68k", "address-register", "speed"],
      docs: { source: "ASP68K" },
    },
    checkLine(ctx, line) {
      if (!isInstructionFamily(line, mnemonic)) return;
      const size = instructionSize(line);
      if (size === "b") return;
      const imm = immediateOperand(line, 0);
      const dest = addressRegisterOperand(line, 1);
      if (!imm || imm.value.type === "string-literal" || !dest) return;
      const value = ctx.evaluate(imm.value);
      if (!value.known) return;
      const displacement = mnemonic === "add" ? value.value : -value.value;
      if (Math.abs(value.value) < 9 || displacement < -32767 || displacement > 32767) return;

      const allowed =
        mnemonic === "add" ? ["mc68000", "mc68010", "mc68030"] : ["mc68000", "mc68010", "mc68030", "mc68040"];
      if (!ctx.config.processors.every((cpu) => allowed.includes(cpu))) return;

      ctx.report({
        ruleId: this.meta.id,
        category: this.meta.category,
        severity: this.meta.defaultSeverity,
        confidence: "high",
        message: `${mnemonic.toUpperCase()} immediate to ${dest.register} can use LEA on this target`,
        loc: line.mnemonic!.loc,
        suggestion: {
          description: `Use LEA ${displacement}(${dest.register}),${dest.register}`,
          replacement: `lea ${displacement}(${dest.register}),${dest.register}`,
          applicability: "safe",
        },
        notes: [
          {
            message:
              "Address-register ADD/SUB and LEA both preserve CCR; ASP68K gives this for signed 16-bit displacements outside the ADDQ/SUBQ range.",
          },
        ],
      });
    },
  };
}

export const addressAddToLea = makeAddressImmediateLea("add");
export const addressSubToLea = makeAddressImmediateLea("sub");
