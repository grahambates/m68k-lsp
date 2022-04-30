import TrimWhitespaceFormatter from "../../../src/formatter/formatters/TrimWhitespaceFormatter";
import { applyEdits, parseTree } from "../../helpers";

async function doFormat(src: string) {
  const formatter = new TrimWhitespaceFormatter();
  const { tree } = await parseTree(src);
  const edits = formatter.format(tree);
  return applyEdits(src, edits);
}

describe("TrimWhitespaceFormatter", () => {
  it("trims whitespace from end of lines", async () => {
    const result = await doFormat(` move d1,d2   \n add d2,d3\t\t`);
    expect(result).toBe(" move d1,d2\n add d2,d3");
  });
});
