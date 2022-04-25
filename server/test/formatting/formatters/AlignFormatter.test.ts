import AlignFormatter, {
  AlignOptions,
} from "../../../src/formatter/formatters/AlignFormatter";
import { applyEdits, parseTree } from "../../helpers";

async function doFormat(src: string, options: AlignOptions) {
  const formatter = new AlignFormatter(options);
  const { tree } = await parseTree(src);
  const edits = formatter.format(tree);
  return applyEdits(src, edits);
}

describe("AlignFormatter", () => {
  it("formats an instruction", async () => {
    const result = await doFormat(`foo:  move d1,d2`, {
      mnemonic: 10,
      operands: 20,
      comment: 35,
    });
    expect(result).toBe("foo:      move      d1,d2");
  });

  it("formats an instruction with a comment", async () => {
    const result = await doFormat(`foo:  move d1,d2; foo`, {
      mnemonic: 10,
      operands: 20,
      comment: 35,
    });
    expect(result).toBe("foo:      move      d1,d2          ; foo");
  });

  it("formats an instruction with no operands", async () => {
    const result = await doFormat(`  rts ; foo`, {
      mnemonic: 10,
      operands: 20,
      comment: 35,
    });
    expect(result).toBe("          rts                      ; foo");
  });

  it("handles a comment-only line", async () => {
    const result = await doFormat(`; foo`, {
      mnemonic: 10,
      operands: 20,
      comment: 35,
    });
    expect(result).toBe("; foo");
  });

  it("inserts a minimum of one space", async () => {
    const result = await doFormat(`foobar:  move d1,d2`, {
      mnemonic: 4,
      operands: 20,
      comment: 35,
    });
    expect(result).toBe("foobar: move        d1,d2");
  });

  it("formats an instruction with tabs", async () => {
    const result = await doFormat(`foobarbaz: move d1,d2; foo`, {
      mnemonic: 2,
      operands: 4,
      comment: 6,
      indentStyle: "tab",
      tabSize: 8,
    });
    expect(result).toBe("foobarbaz:\tmove\t\td1,d2\t\t; foo");
  });
});
