import * as lsp from "vscode-languageserver";
import type Parser from "web-tree-sitter";

/**
 * Get language-server range of tree-sitter node
 */
export function nodeAsRange(node: Parser.SyntaxNode): lsp.Range {
  return lsp.Range.create(
    node.startPosition.row,
    node.startPosition.column,
    node.endPosition.row,
    node.endPosition.column
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
  position: lsp.Position
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
