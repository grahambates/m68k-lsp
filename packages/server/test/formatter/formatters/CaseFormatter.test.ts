import CaseFormatter, {
  CaseOptions,
} from "../../../src/formatter/formatters/CaseFormatter";
import { applyEdits, parseTree } from "../../helpers";

async function doFormat(src: string, options: CaseOptions) {
  const { tree, language } = await parseTree(src);
  const formatter = new CaseFormatter(language, options);
  const edits = formatter.format(tree);
  return applyEdits(src, edits);
}

describe("CaseFormatter", () => {
  it("converts instruction to lower case", async () => {
    const result = await doFormat(` MOVE d0,d1`, { instruction: "lower" });
    expect(result).toBe(" move d0,d1");
  });

  it("converts instruction to upper case", async () => {
    const result = await doFormat(` move d0,d1`, { instruction: "upper" });
    expect(result).toBe(" MOVE d0,d1");
  });

  it("includes size", async () => {
    const result = await doFormat(` MOVE.W d0,d1`, { instruction: "lower" });
    expect(result).toBe(" move.w d0,d1");
  });

  it("converts registers to lower case", async () => {
    const result = await doFormat(` move.w D0,A1`, { register: "lower" });
    expect(result).toBe(" move.w d0,a1");
  });

  it("converts directives to lower case", async () => {
    const result = await doFormat(` DC.W $123`, { directive: "lower" });
    expect(result).toBe(" dc.w $123");
  });

  it("converts control directives to lower case", async () => {
    const result = await doFormat(` IFEQ $123`, { control: "lower" });
    expect(result).toBe(" ifeq $123");
  });

  it("converts control directives to lower case", async () => {
    const result = await doFormat(` section foo,BSS`, { sectionType: "lower" });
    expect(result).toBe(" section foo,bss");
  });

  it("converts hex literals to lower case", async () => {
    const result = await doFormat(` dc.w $AB12`, { hex: "lower" });
    expect(result).toBe(" dc.w $ab12");
  });
});
