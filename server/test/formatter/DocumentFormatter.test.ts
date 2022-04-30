import DocumentFormatter, {
  FormatterOptions,
} from "../../src/formatter/DocumentFormatter";
import { applyEdits, parseTree } from "../helpers";

async function doFormat(src: string, options: FormatterOptions) {
  const { tree, language } = await parseTree(src);
  const formatter = new DocumentFormatter(language, options);
  const edits = formatter.format(tree);
  return applyEdits(src, edits);
}

describe("DocumentFormatter", () => {
  it("formats a document", async () => {
    const src = `
label
foo:    MOVE.W D0,D1 ; example
; comment
`;

    const result = await doFormat(src, {
      case: "lower",
      labelColon: "on",
      align: {
        mnemonic: 10,
        operands: 20,
        comment: 35,
      },
    });

    expect(result).toBe(`
label:
foo:      move.w    d0,d1          ; example
; comment
`);
  });
});
