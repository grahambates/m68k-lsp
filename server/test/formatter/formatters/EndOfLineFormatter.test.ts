import EndOfLineFormatter, {
  EOL,
} from "../../../src/formatter/formatters/EndOfLineFormatter";
import { applyEdits, parseTree } from "../../helpers";

async function doFormat(src: string, type: EOL, finalNewLine?: boolean) {
  const formatter = new EndOfLineFormatter(type, finalNewLine);
  const { tree } = await parseTree(src);
  const edits = formatter.format(tree);
  return applyEdits(src, edits);
}

describe("EndOfLineFormatter", () => {
  it("converts to crlf", async () => {
    const result = await doFormat(` move d1,d2\n add d2,d3`, "crlf");
    expect(result).toBe(" move d1,d2\r\n add d2,d3");
  });

  it("converts to cr", async () => {
    const result = await doFormat(` move d1,d2\n add d2,d3`, "cr");
    expect(result).toBe(" move d1,d2\r add d2,d3");
  });

  it("converts to lf", async () => {
    const result = await doFormat(` move d1,d2\r add d2,d3`, "lf");
    expect(result).toBe(" move d1,d2\n add d2,d3");
  });

  it("adds final new line", async () => {
    const result = await doFormat(` move d1,d2\n add d2,d3`, "lf", true);
    expect(result).toBe(" move d1,d2\n add d2,d3\n");
  });

  it("removes final new line", async () => {
    const result = await doFormat(` move d1,d2\r add d2,d3\r`, "lf", false);
    expect(result).toBe(" move d1,d2\n add d2,d3");
  });
});
