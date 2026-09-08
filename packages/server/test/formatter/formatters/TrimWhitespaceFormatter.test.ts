import TrimWhitespaceFormatter from "../../../src/formatter/formatters/TrimWhitespaceFormatter";
import { applyEdits, formatContext } from "../../helpers";

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
});
