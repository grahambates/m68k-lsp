import { Size } from "./syntax";

export interface ParsedLine {
  label?: Component;
  mnemonic?: Component;
  size?: Component;
  operands?: Component[];
  comment?: Component;
}

export interface Component {
  start: number;
  end: number;
  value: string;
}

export enum ComponentType {
  Label,
  Mnemonic,
  Size,
  Operand,
  Comment,
}

export interface ComponentInfo {
  type: ComponentType;
  component: Component;
  index?: number;
}

// Regex to match line components:
// ^
// (?<label>                           Label:
//   ([a-z0-9_.]+:?)                   - anything at start of line - optional colon
//   |                                   or...
//   (\s+[a-z0-9_.]+:)                 - can have leading whitespace with colon present
// )?
// (\s*                                Instruction or directive:
//   (
//                                     Need seprate case for instructions/directives without operands
//                                     in order for position based comments to work
//                                     i.e. any text following one of these mnemonics should be treated
//                                     as a comment:
//
//     (                                 No-operand mnemonics:
//       (?<mnemonic1>\.?(nop|reset|rte|rtr|rts|trapv|illegal|clrfo|clrso|comment|einline|even|inline|list|mexit|nolist|nopage|odd|page|popsection|pushsection|rsreset|endif|endc|else|elseif|endm|endr|erem))
//       (?<size1>\.[a-z0-9_.]*)?          - Size qualifier
//     )
//     |
//     (                                 Any other mnemonic:
//       (?<mnemonic>\.?([a-z0-9_]+|=))   - Mnemonic
//       (?<size>\.[a-z0-9_.]*)?          - Size qualifier
//       (\s*(?<operands>                 - Operand list:
//         [^\s;,]+                         - first operand
//         (,\s*[^\s;,]*)*                  - additional comma separated operands
//       ))?
//     )
//   )
// )?
// (\s*(?<comment>.+))?                Comment (any trailing text)
// $
const pattern =
  /^(?<label>([a-z0-9_.$\\]+:?)|(\s*[a-z0-9_.$\\]+:))?(\s*(((?<mnemonic1>\.?(nop|reset|rte|rtr|rts|trapv|illegal|clrfo|clrso|comment|einline|even|inline|list|mexit|nolist|nopage|odd|page|popsection|pushsection|rsreset|endif|endc|else|elseif|endm|endr|erem))(?<size1>\.[a-z0-9_.]*)?)|((?<mnemonic>\.?([a-z0-9_]+|=))(?<size>\.[a-z0-9_.]*)?(\s*(?<operands>[^\s;,]+(,\s*[^\s;,]*)*))?)))?(\s*(?<comment>.+))?$/i;

/**
 * Parse a single line of source code into positional components
 *
 * This is much simpler than the syntax tree returned by Tree Sitter but is
 * also less strict and useful for parsing incomplete lines as you type.
 */
export function parseLine(text: string): ParsedLine {
  const line: ParsedLine = {};
  const groups = pattern.exec(text)?.groups;
  if (groups) {
    let end = 0;

    if (groups.label) {
      let value = groups.label.trim();
      if (value.endsWith(":")) {
        value = value.substr(0, value.length - 1);
      }
      const start = text.indexOf(value);
      end = start + value.length;
      line.label = { start, end, value };
    }

    if (groups.mnemonic || groups.mnemonic1) {
      const value = groups.mnemonic || groups.mnemonic1;
      const start = end + text.substr(end).indexOf(value);
      end = start + value.length;
      line.mnemonic = { start, end, value };
    }

    if (groups.size || groups.size1) {
      let value = groups.size || groups.size1;
      const start = end + text.substr(end).indexOf(value) + 1;
      value = value.substr(1);
      end = start + value.length;
      line.size = { start, end, value };
    }

    if (groups.operands) {
      // Split on comma, unless in parens
      const values = groups.operands.split(/,\s*(?![^()]*\))/);

      const operands: Component[] = [];
      for (const value of values) {
        const start = value ? end + text.substr(end).indexOf(value) : end + 1;
        end = start + value.length;
        operands.push({ start, end, value });
      }

      line.operands = operands;
    }

    if (groups.comment && groups.comment.trim()) {
      const value = groups.comment;
      const start = end + text.substr(end).indexOf(value);
      end = start + value.length;
      line.comment = { start, end, value };
    }
  }

  return line;
}

/**
 * Identify the component at given postion on a line
 */
export function componentAtIndex(
  { label, mnemonic, size, operands, comment }: ParsedLine,
  index: number
): ComponentInfo | undefined {
  if (label && containsIndex(label, index)) {
    return {
      component: label,
      type: ComponentType.Label,
    };
  }
  if (mnemonic && containsIndex(mnemonic, index)) {
    return {
      component: mnemonic,
      type: ComponentType.Mnemonic,
    };
  }
  if (size && containsIndex(size, index)) {
    return {
      component: size,
      type: ComponentType.Size,
    };
  }
  if (operands) {
    for (const i in operands) {
      const operand = operands[i];
      if (operand && containsIndex(operand, index)) {
        return {
          component: operand,
          type: ComponentType.Operand,
          index: Number(i),
        };
      }
    }
  }
  if (comment && containsIndex(comment, index)) {
    return {
      component: comment,
      type: ComponentType.Comment,
    };
  }

  return;
}

function containsIndex(component: Component, index: number): boolean {
  return component.start <= index && component.end >= index;
}

export interface SignatureInfo {
  label: string;
  sizes: Size[];
  size?: Component;
  operands: Component[];
}

/**
 * Get components from syntax signature text
 */
export function parseSignature(text: string): SignatureInfo {
  const info: SignatureInfo = { label: text, sizes: [], operands: [] };
  let end = 0;

  const [inst, opList] = text.split(" ");
  const [, size] = inst.split(".");
  if (size) {
    const value = size.replace(/[\]]/g, "");
    const start = end + text.substr(end).indexOf(value);
    end = start + value.length;
    info.size = { start, end, value };
    info.sizes = <Size[]>value.replace(/[().]/g, "").split("");
  }

  if (opList) {
    for (const op of opList.split(",")) {
      const value = op.replace(/[[\]]/g, "");
      const start = end + text.substr(end).indexOf(value);
      end = start + value.length;
      info.operands.push({ start, end, value });
    }
  }

  return info;
}
