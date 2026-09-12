import TrimWhitespaceFormatter from "../../src/formatter/formatters/TrimWhitespaceFormatter";
import { applyEdits, formatContext } from "../helpers";

async function doFormat(src: string) {
  const formatter = new TrimWhitespaceFormatter();
  const edits = formatter.format(formatContext(src));
  return applyEdits(src, edits);
}

describe("TrimWhitespaceFormatter", () => {
  it("trims whitespace from end of lines", async () => {
    const result = await doFormat(` move d1,d2   \n add d2,d3\t\t`);
    expect(result).toBe(" move d1,d2\n add d2,d3");
  });

  it("trims a line consisting only of whitespace", async () => {
    // match.index is 0 when the whole line is whitespace, which is falsy in
    // JS - a truthiness check on it rather than an undefined check would
    // silently skip exactly this case.
    const result = await doFormat("move d1,d2\n   \nadd d2,d3");
    expect(result).toBe("move d1,d2\n\nadd d2,d3");
  });

  it("trims a line of only tabs", async () => {
    const result = await doFormat("move d1,d2\n\t\t\nadd d2,d3");
    expect(result).toBe("move d1,d2\n\nadd d2,d3");
  });

  it("leaves a line with no trailing whitespace unchanged", async () => {
    const result = await doFormat(" move d1,d2\n add d2,d3");
    expect(result).toBe(" move d1,d2\n add d2,d3");
  });

  it("leaves an already-empty line unchanged", async () => {
    const result = await doFormat("move d1,d2\n\nadd d2,d3");
    expect(result).toBe("move d1,d2\n\nadd d2,d3");
  });

  it("trims trailing whitespace on every affected line in a document", async () => {
    const result = await doFormat(" move d1,d2  \n add d2,d3\t\n rts   ");
    expect(result).toBe(" move d1,d2\n add d2,d3\n rts");
  });

  it("preserves internal whitespace", async () => {
    const result = await doFormat(" move   d1,d2   ");
    expect(result).toBe(" move   d1,d2");
  });
});
