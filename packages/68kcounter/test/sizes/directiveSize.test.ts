import parse from "../../src/parse";

describe("directiveSize", () => {
  test("dc.w", () => {
    const [result] = parse(" dc.w 0,0,0");
    expect(result.bytes).toEqual(6);
  });

  test("dw", () => {
    const [result] = parse(" dw 0,0,0");
    expect(result.bytes).toEqual(6);
  });

  test("dc.x", () => {
    const [result] = parse(" dc.x 0,0,0");
    expect(result.bytes).toEqual(36);
  });

  test("dcb.w", () => {
    const [result] = parse(" dcb.w #3");
    expect(result.bytes).toEqual(6);
  });

  test("ds.w", () => {
    const [result] = parse(" ds.w #3");
    expect(result.bytes).toEqual(6);
  });

  test("dcb.w from vars", () => {
    const code = `
foo=2
  dcb.w #foo*2
`;
    const result = parse(code);
    expect(result[2].bytes).toEqual(8);
  });

  test("dc.b string", () => {
    const [result] = parse('.GfxLib:dc.b "graphics.library",0,0');
    expect(result.bytes).toEqual(18);
  });

  test("dc.b string: single quotes", () => {
    const [result] = parse(".GfxLib:dc.b 'graphics.library',0,0");
    expect(result.bytes).toEqual(18);
  });

  test("dcb.w from label range", () => {
    const code = `
start:
      dc.w 0
      dc.l 0
end:
      dcb.b end-start
`;
    const result = parse(code);
    expect(result[5].bytes).toEqual(6);
  });
});
