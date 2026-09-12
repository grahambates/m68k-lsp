import type { Location, ParsedLine } from "m68k-parser";

/**
 * Any node in an m68k-parser syntax tree.
 *
 * The parser exports a closed union of around forty node interfaces which
 * share no common base beyond `type` and `loc`, and that union grows with each
 * parser release. Traversal below is therefore structural rather than a switch
 * over the union: a node type added upstream is walked without a change here.
 */
export interface AstNode {
  type: string;
  loc: Location;
}

export function isAstNode(value: unknown): value is AstNode {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { type, loc } = value as Partial<AstNode>;
  return (
    typeof type === "string" &&
    typeof loc === "object" &&
    loc !== null &&
    typeof loc.start === "number"
  );
}

/**
 * Collect nodes held directly by an object's own properties.
 *
 * Covers both single-node properties (`ImmediateNode.value`) and node arrays
 * (`ParsedLine.operands`). Non-node values such as `Location`, `lineNumber`
 * and `RegisterListNode.raw` fail the guard and are skipped.
 */
function collectNodes(source: object): AstNode[] {
  const nodes: AstNode[] = [];
  for (const value of Object.values(source)) {
    if (isAstNode(value)) {
      nodes.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) {
          nodes.push(item);
        }
      }
    }
  }
  return nodes.sort((a, b) => a.loc.start - b.loc.start);
}

/** Direct children of a node, in source order. */
export function childNodes(node: AstNode): AstNode[] {
  return collectNodes(node);
}

/**
 * Top level components of a line (label, mnemonic, qualifier, operands,
 * comment), in source order. A `ParsedLine` is a plain record rather than a
 * node, so it has no `loc` of its own.
 */
export function lineNodes(line: ParsedLine): AstNode[] {
  return collectNodes(line);
}

/** Every node on a line, parents before children. */
export function walkLine(line: ParsedLine): AstNode[] {
  const out: AstNode[] = [];
  const visit = (nodes: AstNode[]) => {
    for (const node of nodes) {
      out.push(node);
      visit(childNodes(node));
    }
  };
  visit(lineNodes(line));
  return out;
}
