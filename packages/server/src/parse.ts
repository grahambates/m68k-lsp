import type { Location } from "m68k-parser";
import { parseLine as parseM68k } from "m68k-parser";

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

/**
 * Parse a single line of source code into positional components.
 *
 * A flat, position-oriented view of a line, kept deliberately simpler than the
 * full m68k-parser AST: consumers here only care where each element sits and
 * what text it covers. The parser is resilient, so half-typed lines still come
 * back usable, which is what completion and signature help rely on.
 */
export function parseLine(text: string): ParsedLine {
  const { value: ast } = parseM68k(text);
  const line: ParsedLine = {};

  const component = ({ start, end }: Location): Component => ({
    start,
    end,
    value: text.slice(start, end),
  });

  if (ast.label) {
    line.label = component(ast.label.loc);
  }
  if (ast.mnemonic) {
    line.mnemonic = component(ast.mnemonic.loc);
  }
  if (ast.qualifier) {
    line.size = component(ast.qualifier.loc);
  } else if (line.mnemonic) {
    // m68k-parser only emits a qualifier for a size it recognises, so a
    // half-typed one ("move." or "move.z") produces no node at all. Completion
    // needs to know the cursor is on a size there, so synthesise the component
    // from the text following the dot.
    const dot = line.mnemonic.end;
    if (text[dot] === ".") {
      const start = dot + 1;
      const end = start + /^[^\s.,;*]*/.exec(text.slice(start))![0].length;
      line.size = { start, end, value: text.slice(start, end) };
    }
  }
  if (ast.operands?.length) {
    line.operands = ast.operands.map((operand) => component(operand.loc));
  }
  if (ast.comment) {
    line.comment = component(ast.comment.loc);
  }

  return line;
}

/**
 * Identify the component at given postion on a line
 */
export function componentAtIndex(
  { label, mnemonic, size, operands, comment }: ParsedLine,
  index: number,
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
