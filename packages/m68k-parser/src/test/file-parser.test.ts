import { parseFile } from "../file-parser.js";

describe("parseFile", () => {
  describe("basic functionality", () => {
    it("should parse empty file", () => {
      const result = parseFile("");
      expect(result.lines.length).toBe(1); // Empty string splits to one empty line
      expect(result.errors.length).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lineNumber).toBe(1);
    });

    it("should parse single line", () => {
      const result = parseFile("  move.w d0,d1");
      expect(result.lines.length).toBe(1);
      expect(result.errors.length).toBe(0);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lineNumber).toBe(1);
      expect(result.lines[0].mnemonic?.type).toBe("instruction");
      expect(result.lines[0].operands).toHaveLength(2);
    });

    it("should parse multiple lines", () => {
      const source = `  move.w d0,d1
  add.l d2,d3
  bra.s label`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(3);
      expect(result.errors.length).toBe(0);
      expect(result.lines).toHaveLength(3);

      expect(result.lines[0].lineNumber).toBe(1);

      expect(result.lines[1].lineNumber).toBe(2);

      expect(result.lines[2].lineNumber).toBe(3);
    });
  });

  describe("line ending normalization", () => {
    it("should handle Unix line endings (\\n)", () => {
      const source = "line1\nline2\nline3";
      const result = parseFile(source);
      expect(result.lines.length).toBe(3);
    });

    it("should handle Windows line endings (\\r\\n)", () => {
      const source = "line1\r\nline2\r\nline3";
      const result = parseFile(source);
      expect(result.lines.length).toBe(3);
    });

    it("should handle old Mac line endings (\\r)", () => {
      const source = "line1\rline2\rline3";
      const result = parseFile(source);
      expect(result.lines.length).toBe(3);
    });

    it("should handle mixed line endings", () => {
      const source = "line1\r\nline2\nline3\rline4";
      const result = parseFile(source);
      expect(result.lines.length).toBe(4);
    });
  });

  describe("error handling and aggregation", () => {
    it("should collect errors from single line", () => {
      const source = "  move.w 10(d0),d1 ; invalid base register";
      const result = parseFile(source);
      expect(result.lines.length).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].loc.line).toBe(1);
      expect(result.errors[0].code).toBe("INVALID_BASE_REGISTER");
    });

    it("should collect errors from multiple lines", () => {
      const source = `  move.w 10(d0),d1
  add.l 20(d2),d3
  sub.w 30(d4),d5`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(3);
      expect(result.errors.length).toBe(3); // All have data registers as base
      expect(result.errors).toHaveLength(3);

      expect(result.errors[0].loc.line).toBe(1);
      expect(result.errors[0].code).toBe("INVALID_BASE_REGISTER");

      expect(result.errors[1].loc.line).toBe(2);
      expect(result.errors[1].code).toBe("INVALID_BASE_REGISTER");

      expect(result.errors[2].loc.line).toBe(3);
      expect(result.errors[2].code).toBe("INVALID_BASE_REGISTER");
    });

    it("should handle multiple errors on same line", () => {
      const source = "  move.w (d0,d1),d2 ; data register as base";
      const result = parseFile(source);
      expect(result.lines.length).toBe(1);
      expect(result.errors.length).toBe(1); // d0 as base register
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].loc.line).toBe(1);
      expect(result.errors[0].code).toBe("INVALID_BASE_REGISTER");
    });

    it("should correctly count errors with some valid lines", () => {
      const source = `  move.w d0,d1
  add.l 10(d2),d3
  sub.w d3,d4
  or.w 20(d5),d6`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(4);
      expect(result.errors.length).toBe(2); // d2 and d5 as base registers
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].loc.line).toBe(2);
      expect(result.errors[0].code).toBe("INVALID_BASE_REGISTER");
      expect(result.errors[1].loc.line).toBe(4);
      expect(result.errors[1].code).toBe("INVALID_BASE_REGISTER");
    });
  });

  describe("complex assembly files", () => {
    it("should parse file with labels, instructions, and directives", () => {
      const source = `start:
  move.w #100,d0
loop:
  dbf d0,loop
  rts
data:
  dc.w 1,2,3`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(7);
      expect(result.errors.length).toBe(0);

      // Check labels
      expect(result.lines[0].label?.label).toBe("start");
      expect(result.lines[2].label?.label).toBe("loop");
      expect(result.lines[5].label?.label).toBe("data");

      // Check instructions
      expect(result.lines[1].mnemonic?.type).toBe("instruction");
      expect(result.lines[3].mnemonic?.type).toBe("instruction");

      // Check directive
      expect(result.lines[6].mnemonic?.type).toBe("directive");
    });

    it("should parse file with comments", () => {
      const source = `; This is a comment
  move.w d0,d1 ; inline comment
* Another comment style
  add.l d2,d3`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(4);
      expect(result.errors.length).toBe(0);

      // Line 1: just comment
      expect(result.lines[0].comment?.content).toContain("This is a comment");

      // Line 2: instruction with inline comment
      expect(result.lines[1].mnemonic?.type).toBe("instruction");
      expect(result.lines[1].comment?.content).toContain("inline comment");

      // Line 3: just comment
      expect(result.lines[2].comment?.content).toContain(
        "Another comment style",
      );

      // Line 4: instruction
      expect(result.lines[3].mnemonic?.type).toBe("instruction");
    });

    it("should parse file with macro parameters", () => {
      const source = `mymacro:
  move.w \\1,\\2
  add.l \\@,d0
  sub.w \\<param>,d1`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(4);
      expect(result.errors.length).toBe(0);

      // Check that macro parameters are parsed
      expect(result.lines[1].operands?.[0]?.type).toBe("macro-parameter");
      expect(result.lines[1].operands?.[1]?.type).toBe("macro-parameter");
    });

    it("should handle empty lines", () => {
      const source = `  move.w d0,d1

  add.l d2,d3

`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(5);
      expect(result.errors.length).toBe(0);

      // Non-empty lines
      expect(result.lines[0].mnemonic?.type).toBe("instruction");
      expect(result.lines[2].mnemonic?.type).toBe("instruction");
    });

    it("should handle whitespace-only lines", () => {
      const source = `  move.w d0,d1

  add.l d2,d3`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(3);
      expect(result.errors.length).toBe(0);
    });
  });

  describe("realistic assembly programs", () => {
    it("should parse a simple subroutine", () => {
      const source = `* Multiply d0 by 10
multiply_by_10:
  move.l d0,d1     ; save original
  lsl.l #3,d0      ; multiply by 8
  lsl.l #1,d1      ; multiply by 2
  add.l d1,d0      ; 8 + 2 = 10
  rts`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(7); // 7 lines: comment, label, 4 instructions, rts
      expect(result.errors.length).toBe(0);
      expect(result.lines[1].label?.label).toBe("multiply_by_10");
    });

    it("should parse data section", () => {
      const source = `data_section:
  dc.b 'Hello',0
  dc.w $1234,$5678
  dc.l -1,0,1
  ds.b 100`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(5);
      expect(result.errors.length).toBe(0);

      // All should be directives
      expect(result.lines[1].mnemonic?.type).toBe("directive");
      expect(result.lines[2].mnemonic?.type).toBe("directive");
      expect(result.lines[3].mnemonic?.type).toBe("directive");
      expect(result.lines[4].mnemonic?.type).toBe("directive");
    });

    it("should parse file with addressing modes", () => {
      const source = `test:
  move.w d0,d1              ; register
  move.w #100,d0            ; immediate
  move.w (a0),d0            ; indirect
  move.w (a0)+,d0           ; post-increment
  move.w -(a0),d0           ; pre-decrement
  move.w 10(a0),d0          ; displacement
  move.w 10(a0,d1.w),d0     ; indexed
  move.w $1000,d0           ; absolute
  move.w label(pc),d0       ; pc-relative`;
      const result = parseFile(source);
      expect(result.lines.length).toBe(10);
      expect(result.errors.length).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("should handle very long file", () => {
      const lines = Array(1000).fill("  move.w d0,d1");
      const source = lines.join("\n");
      const result = parseFile(source);
      expect(result.lines.length).toBe(1000);
      expect(result.errors.length).toBe(0);
      expect(result.lines).toHaveLength(1000);
    });

    it("should handle file ending without newline", () => {
      const source = "line1\nline2";
      const result = parseFile(source);
      expect(result.lines.length).toBe(2);
    });

    it("should handle file ending with newline", () => {
      const source = "line1\nline2\n";
      const result = parseFile(source);
      expect(result.lines.length).toBe(3);
    });
  });
});
