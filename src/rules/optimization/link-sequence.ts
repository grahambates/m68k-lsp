import type { ParsedLine } from "m68k-parser";
import type { Rule } from "../../core/rule.js";
import { addressRegisterOperand, immediateOperand, instructionSize, isInstruction, operand } from "../../util/ast.js";

function isSpRegister(line: ParsedLine, operandIndex: number): boolean {
  const op = addressRegisterOperand(line, operandIndex);
  return !!op && ["sp", "a7"].includes(op.register.toLowerCase());
}

function isSpPredec(line: ParsedLine, operandIndex: number): boolean {
  const op = operand(line, operandIndex);
  return (
    op?.type === "address-register-indirect-predec" &&
    op.register.type === "address-register" &&
    ["sp", "a7"].includes(op.register.register.toLowerCase())
  );
}

export const preferLinkSequence: Rule = {
  meta: {
    id: "optimization/prefer-link-sequence",
    category: "optimization",
    defaultSeverity: "suggestion",
    description: "Use LINK for a standard frame setup sequence",
    tags: ["asp68k", "stack", "peephole", "size"],
    docs: { source: "ASP68K" },
  },
  checkLine(ctx, line, index) {
    if (!isInstruction(line, "move") || instructionSize(line) !== "l") return;
    const frame = addressRegisterOperand(line, 0);
    if (!frame || !isSpPredec(line, 1)) return;

    const second = ctx.nextInstruction(index);
    if (!second || !isInstruction(second.line, "movea") || instructionSize(second.line) !== "l") return;
    if (!isSpRegister(second.line, 0)) return;
    const frameDest = addressRegisterOperand(second.line, 1);
    if (!frameDest || frameDest.register.toLowerCase() !== frame.register.toLowerCase()) return;

    const third = ctx.nextInstruction(second.index);
    if (!third || (!isInstruction(third.line, "add") && !isInstruction(third.line, "adda"))) return;
    if (instructionSize(third.line) !== "w" || !isSpRegister(third.line, 1)) return;
    const imm = immediateOperand(third.line, 0);
    if (!imm || imm.value.type === "string-literal") return;
    const value = ctx.evaluate(imm.value);
    if (!value.known || value.value < -32767 || value.value > 32767) return;

    const manual = !!second.line.label || !!third.line.label;
    ctx.report({
      ruleId: this.meta.id,
      category: this.meta.category,
      severity: this.meta.defaultSeverity,
      confidence: manual ? "high" : "certain",
      message: "Standard stack-frame setup can use LINK",
      loc: line.mnemonic!.loc,
      suggestion: {
        description: `Replace the three instructions with LINK ${frame.register},#${value.value}`,
        replacement: manual ? undefined : `link ${frame.register},#${value.value}`,
        applicability: manual ? "manual" : "safe",
      },
      notes: [
        {
          message:
            "LINK performs the same three steps: save the frame pointer, take the new one, and reserve the frame.",
        },
        ...(manual
          ? [
              {
                message:
                  "A later instruction in the matched sequence has a label; preserve any externally reachable entry point.",
              },
            ]
          : []),
      ],
      data: { secondInstructionIndex: second.index, thirdInstructionIndex: third.index },
    });
  },
};
