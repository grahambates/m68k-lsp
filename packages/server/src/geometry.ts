import type { Location } from "m68k-parser";
import * as lsp from "vscode-languageserver";
import type Parser from "web-tree-sitter";

/**
 * Get language-server range of an m68k-parser node location.
 *
 * `Location.line` is one-based and absent entirely for a location produced by
 * `parseLine`, whereas language-server positions are zero-based. Pass `line`
 * explicitly (zero-based) when the location came from a single parsed line.
 * Columns need no adjustment: both are zero-based and end-exclusive.
 */
export function locationAsRange(loc: Location, line?: number): lsp.Range {
  const row = line ?? (loc.line !== undefined ? loc.line - 1 : 0);
  return lsp.Range.create(row, loc.start, row, loc.end);
}

/**
 * Get language-server range of tree-sitter node
 */
export function nodeAsRange(node: Parser.SyntaxNode): lsp.Range {
  return lsp.Range.create(
    node.startPosition.row,
    node.startPosition.column,
    node.endPosition.row,
    node.endPosition.column,
  );
}

/**
 * Is position a <= position b?
 */
export function isBeforeOrEqual(a: lsp.Position, b: lsp.Position): boolean {
  if (a.line < b.line) {
    return true;
  }
  if (b.line < a.line) {
    return false;
  }
  return a.character <= b.character;
}

/**
 * Does range contain position?
 */
export function containsPosition(
  range: lsp.Range,
  position: lsp.Position,
): boolean {
  return (
    isBeforeOrEqual(range.start, position) &&
    isBeforeOrEqual(position, range.end)
  );
}

/**
 * Does range contain sub-range?
 */
export function containsRange(range: lsp.Range, subRange: lsp.Range): boolean {
  return (
    isBeforeOrEqual(range.start, subRange.start) &&
    isBeforeOrEqual(subRange.end, range.end)
  );
}

/**
 * Convert language-server position to tree-sitter point
 */
export function positionToPoint(position: lsp.Position): Parser.Point {
  const { line: row, character: column } = position;
  return { row, column };
}
