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
    // An unrecognised or half-typed size ("move." / "move.z") comes back as an
    // unknown qualifier spanning the text after the dot, which is empty in the
    // first case. Completion needs that to know the cursor is on a size.
    line.size = component(ast.qualifier.loc);
  }
  if (ast.operands?.length) {
    line.operands = ast.operands.map((operand) => component(operand.loc));
  }
  if (ast.comment) {
    line.comment = component(ast.comment.loc);
  }

  return line;
}
