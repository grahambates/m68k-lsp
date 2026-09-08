import QuotesFormatter, {
  QuotesOptions,
} from "../../../src/formatter/formatters/QuotesFormatter";
import { applyEdits, parseTree } from "../../helpers";

async function doFormat(src: string, options: QuotesOptions) {
  const { tree, language } = await parseTree(src);
  const formatter = new QuotesFormatter(language, options);
  const edits = formatter.format(tree);
  return applyEdits(src, edits);
}

describe("QuotesFormatter", () => {
  it("converts to single", async () => {
    const result = await doFormat(` dc.b "foo bar baz"`, "single");
    expect(result).toBe(" dc.b 'foo bar baz'");
  });

  it("converts to double", async () => {
    const result = await doFormat(` dc.b 'foo bar baz'`, "double");
    expect(result).toBe(` dc.b "foo bar baz"`);
  });

  it("leaves as-is", async () => {
    const result = await doFormat(` dc.b 'foo bar baz'`, "any");
    expect(result).toBe(` dc.b 'foo bar baz'`);
  });
});
