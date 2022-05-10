import { DiagnosticSeverity } from "vscode-languageserver";
import { parseVasmOutput } from "../src/diagnostics";

describe("diagnostics", () => {
  describe("parseVasmOutput", () => {
    it("parses an empty string with no errors", () => {
      const result = parseVasmOutput("");
      expect(result).toHaveLength(0);
    });

    it("parses no-line errors", () => {
      const output =
        "fatal error 13: could not open <example.s> for input\naborting...";
      const result = parseVasmOutput(output);

      expect(result).toHaveLength(1);

      expect(result[0].code).toBe(13);
      expect(result[0].message).toBe("could not open <example.s> for input");
      expect(result[0].source).toBe("vasm");
      expect(result[0].severity).toBe(DiagnosticSeverity.Error);
      expect(result[0].range).toEqual({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
      });
    });

    it("parses line error output", () => {
      const output = `
error 2 in line 9 of "example.s": unknown mnemonic <dsfsdf>
>            dsfsdf

fatal error 2001 in line 10 of "example.s": instruction not supported on selected architecture
>            muls.l d0,d1
aborting...
      `;
      const result = parseVasmOutput(output);

      expect(result).toHaveLength(2);

      expect(result[0].code).toBe(2);
      expect(result[0].message).toBe("unknown mnemonic <dsfsdf>");
      expect(result[0].source).toBe("vasm");
      expect(result[0].severity).toBe(DiagnosticSeverity.Error);
      expect(result[0].range).toEqual({
        start: { line: 8, character: 12 },
        end: { line: 8, character: 18 },
      });

      expect(result[1].code).toBe(2001);
      expect(result[1].message).toBe(
        "instruction not supported on selected architecture"
      );
      expect(result[1].source).toBe("vasm");
      expect(result[1].severity).toBe(DiagnosticSeverity.Error);
      expect(result[1].range).toEqual({
        start: { line: 9, character: 12 },
        end: { line: 9, character: 24 },
      });
    });

    it("parses multi-line errors", () => {
      const output = `
error 9 in line 1 of "STAT_SVZC": instruction not supported on selected architecture
called from line 798 of "example.s"
>	move.w	ccr,StatusSZ				[06]

error 2 in line 1 of "a.i": unknown mnemonic <sdsdffd>
	included from line 1 of "b.i"
	included from line 9 of "example.s"
>            sdsdffd
`;

      const result = parseVasmOutput(output);

      expect(result).toHaveLength(2);

      expect(result[0].code).toBe(9);
      expect(result[0].message).toBe(
        `error 9 in line 1 of "STAT_SVZC": instruction not supported on selected architecture`
      );
      expect(result[0].source).toBe("vasm");
      expect(result[0].severity).toBe(DiagnosticSeverity.Error);
      expect(result[0].range).toEqual({
        start: { line: 797, character: 1 },
        end: { line: 797, character: 28 },
      });

      expect(result[1].code).toBe(2);
      expect(result[1].message).toBe(
        `error 2 in line 1 of "a.i": unknown mnemonic <sdsdffd>
	included from line 1 of "b.i"`
      );
      expect(result[1].source).toBe("vasm");
      expect(result[1].severity).toBe(DiagnosticSeverity.Error);
      expect(result[1].range).toEqual({
        start: { line: 8, character: 12 },
        end: { line: 8, character: 19 },
      });
    });

    it("sets severity level", () => {
      const output = `warning 2 in line 9 of "example.s": uh oh spaghettios`;
      const result = parseVasmOutput(output);
      expect(result[0].severity).toBe(DiagnosticSeverity.Warning);
    });
  });
});
