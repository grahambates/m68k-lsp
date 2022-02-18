import * as formatting from "../src/formatting";

describe("formatting", () => {
  describe("#formatDeclaration()", () => {
    it("formats a declaration", async () => {
      const formatted = formatting.formatDeclaration("    xref foo  ; example");
      expect(formatted).toEqual(" xref foo");
    });
  });

  describe("#asciiValue()", () => {
    it("returns the ascii character", async () => {
      const ascii = formatting.asciiValue(60);
      expect(ascii).toEqual("<");
    });
  });

  describe("#formatNumeric()", () => {
    it("formats a number", async () => {
      const ascii = formatting.formatNumeric("20");
      expect(ascii).toEqual('20 | $14 | %10100 | @24 | "."');
    });
  });
});
