import { Position } from "vscode-languageserver-types";
import type Parser from "web-tree-sitter";
import * as geometry from "../src/geometry";
import { range } from "./helpers";

describe("geometry", () => {
  describe("#nodeAsRange()", () => {
    it("converts a node to a range", async () => {
      const node = {
        startPosition: { row: 0, column: 1 },
        endPosition: { row: 2, column: 3 },
        startIndex: 4,
        endIndex: 5,
      } as Parser.SyntaxNode;

      const nodeRange = geometry.nodeAsRange(node);
      expect(nodeRange).toEqual(range(0, 1, 2, 3));
    });
  });

  describe("#isBeforeOrEqual()", () => {
    it("returns true if before", async () => {
      const res = geometry.isBeforeOrEqual(
        Position.create(0, 0),
        Position.create(0, 1)
      );
      expect(res).toBeTruthy();
    });

    it("returns true if equal", async () => {
      const res = geometry.isBeforeOrEqual(
        Position.create(0, 1),
        Position.create(0, 1)
      );
      expect(res).toBeTruthy();
    });

    it("returns false if after", async () => {
      const res = geometry.isBeforeOrEqual(
        Position.create(0, 1),
        Position.create(0, 0)
      );
      expect(res).toBeFalsy();
    });
  });

  describe("#containsPosition()", () => {
    it("returns true if in range", async () => {
      const res = geometry.containsPosition(
        range(0, 0, 1, 10),
        Position.create(0, 1)
      );
      expect(res).toBeTruthy();
    });

    it("returns false if not in range", async () => {
      const res = geometry.containsPosition(
        range(0, 0, 1, 10),
        Position.create(2, 1)
      );
      expect(res).toBeFalsy();
    });
  });

  describe("#containsRange()", () => {
    it("returns true if in range", async () => {
      const res = geometry.containsRange(range(0, 0, 1, 10), range(0, 0, 1, 5));
      expect(res).toBeTruthy();
    });

    it("returns false if not in range", async () => {
      const res = geometry.containsRange(range(0, 0, 1, 10), range(0, 0, 2, 1));
      expect(res).toBeFalsy();
    });
  });

  describe("#positionToPoint()", () => {
    it("returns true if in range", async () => {
      const res = geometry.positionToPoint(Position.create(0, 1));
      expect(res).toEqual({
        row: 0,
        column: 1,
      });
    });
  });
});
