import { tokenizeOperand } from "../operand-tokenizer.js";

describe("Operand Tokenizer", () => {
  it("should tokenize simple register", () => {
    const { tokens } = tokenizeOperand("d0");
    expect(tokens.length).toBe(2); // d0 + EOF
    expect(tokens[0].type).toBe("register");
    expect(tokens[0].value).toBe("d0");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize immediate value with hex number", () => {
    const { tokens } = tokenizeOperand("#$FF");
    expect(tokens.length).toBe(3); // # + $FF + EOF
    expect(tokens[0].type).toBe("hash");
    expect(tokens[1].type).toBe("number");
    expect(tokens[1].value).toBe("$FF");
    expect(tokens[2].type).toBe("eof");
  });

  it("should tokenize memory indirect addressing", () => {
    const { tokens } = tokenizeOperand("([8,a1,d0.w*2],4)");
    expect(tokens[0].type).toBe("lparen");
    expect(tokens[1].type).toBe("lbracket");
    expect(tokens[2].type).toBe("number");
    expect(tokens[2].value).toBe("8");
    expect(tokens[3].type).toBe("comma");
    expect(tokens[4].type).toBe("register");
    expect(tokens[4].value).toBe("a1");
    expect(tokens[5].type).toBe("comma");
    expect(tokens[6].type).toBe("register");
    expect(tokens[6].value).toBe("d0");
    expect(tokens[7].type).toBe("dot");
    expect(tokens[8].type).toBe("symbol");
    expect(tokens[8].value).toBe("w");
    expect(tokens[9].type).toBe("star");
    expect(tokens[10].type).toBe("number");
    expect(tokens[10].value).toBe("2");
    expect(tokens[11].type).toBe("rbracket");
    expect(tokens[12].type).toBe("comma");
    expect(tokens[13].type).toBe("number");
    expect(tokens[13].value).toBe("4");
    expect(tokens[14].type).toBe("rparen");
    expect(tokens[15].type).toBe("eof");
  });

  it("should tokenize indexed addressing", () => {
    const { tokens } = tokenizeOperand("8(a0,d1.w*2)");
    expect(tokens[0].type).toBe("number");
    expect(tokens[0].value).toBe("8");
    expect(tokens[1].type).toBe("lparen");
    expect(tokens[2].type).toBe("register");
    expect(tokens[2].value).toBe("a0");
    expect(tokens[3].type).toBe("comma");
    expect(tokens[4].type).toBe("register");
    expect(tokens[4].value).toBe("d1");
    expect(tokens[5].type).toBe("dot");
    expect(tokens[6].type).toBe("symbol");
    expect(tokens[6].value).toBe("w");
    expect(tokens[7].type).toBe("star");
    expect(tokens[8].type).toBe("number");
    expect(tokens[8].value).toBe("2");
    expect(tokens[9].type).toBe("rparen");
    expect(tokens[10].type).toBe("eof");
  });

  it("should tokenize bitfield specification", () => {
    const { tokens } = tokenizeOperand("{d0:8}");
    expect(tokens[0].type).toBe("lbrace");
    expect(tokens[1].type).toBe("register");
    expect(tokens[1].value).toBe("d0");
    expect(tokens[2].type).toBe("colon");
    expect(tokens[3].type).toBe("number");
    expect(tokens[3].value).toBe("8");
    expect(tokens[4].type).toBe("rbrace");
    expect(tokens[5].type).toBe("eof");
  });

  it("should tokenize string literals with double quotes", () => {
    const { tokens } = tokenizeOperand('"Hello"');
    expect(tokens[0].type).toBe("string");
    expect(tokens[0].value).toBe('"Hello"');
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize string literals with single quotes", () => {
    const { tokens } = tokenizeOperand("'World'");
    expect(tokens[0].type).toBe("string");
    expect(tokens[0].value).toBe("'World'");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize string literals with angle brackets", () => {
    const { tokens } = tokenizeOperand("<text>");
    expect(tokens[0].type).toBe("string");
    expect(tokens[0].value).toBe("<text>");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize binary numbers", () => {
    const { tokens } = tokenizeOperand("%101010");
    expect(tokens[0].type).toBe("number");
    expect(tokens[0].value).toBe("%101010");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize octal numbers", () => {
    const { tokens } = tokenizeOperand("@77");
    expect(tokens[0].type).toBe("number");
    expect(tokens[0].value).toBe("@77");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize decimal numbers", () => {
    const { tokens } = tokenizeOperand("123");
    expect(tokens[0].type).toBe("number");
    expect(tokens[0].value).toBe("123");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize symbols", () => {
    const { tokens } = tokenizeOperand("label");
    expect(tokens[0].type).toBe("symbol");
    expect(tokens[0].value).toBe("label");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize macro parameters - numeric", () => {
    const { tokens } = tokenizeOperand("\\1");
    expect(tokens[0].type).toBe("symbol"); // Macro params are treated as symbols in tokenizer
    expect(tokens[0].value).toBe("\\1");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize macro parameters - special", () => {
    const { tokens } = tokenizeOperand("\\@");
    expect(tokens[0].type).toBe("symbol");
    expect(tokens[0].value).toBe("\\@");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize macro parameters - named", () => {
    const { tokens } = tokenizeOperand("\\<param>");
    expect(tokens[0].type).toBe("symbol");
    expect(tokens[0].value).toBe("\\<param>");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize macro parameters - unique push", () => {
    const { tokens } = tokenizeOperand("\\@!");
    expect(tokens[0].type).toBe("symbol");
    expect(tokens[0].value).toBe("\\@!");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize macro parameters - unique pull", () => {
    const { tokens } = tokenizeOperand("\\@@");
    expect(tokens[0].type).toBe("symbol");
    expect(tokens[0].value).toBe("\\@@");
    expect(tokens[1].type).toBe("eof");
  });

  it("should tokenize operators correctly", () => {
    const { tokens } = tokenizeOperand("(a+b-c*d/e)");
    expect(tokens[0].type).toBe("lparen");
    expect(tokens[1].type).toBe("symbol");
    expect(tokens[1].value).toBe("a");
    expect(tokens[2].type).toBe("plus");
    expect(tokens[3].type).toBe("symbol");
    expect(tokens[3].value).toBe("b");
    expect(tokens[4].type).toBe("minus");
    expect(tokens[5].type).toBe("symbol");
    expect(tokens[5].value).toBe("c");
    expect(tokens[6].type).toBe("star");
    expect(tokens[7].type).toBe("symbol");
    expect(tokens[7].value).toBe("d");
    expect(tokens[8].type).toBe("slash");
    expect(tokens[9].type).toBe("symbol");
    expect(tokens[9].value).toBe("e");
    expect(tokens[10].type).toBe("rparen");
    expect(tokens[11].type).toBe("eof");
  });

  it("should skip whitespace", () => {
    const { tokens } = tokenizeOperand("  a0  ,  d1  ");
    expect(tokens[0].type).toBe("register");
    expect(tokens[0].value).toBe("a0");
    expect(tokens[1].type).toBe("comma");
    expect(tokens[2].type).toBe("register");
    expect(tokens[2].value).toBe("d1");
    expect(tokens[3].type).toBe("eof");
  });

  it("should track token positions", () => {
    const { tokens } = tokenizeOperand("8(a0,d1)");
    expect(tokens[0].position).toBe(0); // 8
    expect(tokens[1].position).toBe(1); // (
    expect(tokens[2].position).toBe(2); // a0
    expect(tokens[3].position).toBe(4); // ,
    expect(tokens[4].position).toBe(5); // d1
    expect(tokens[5].position).toBe(7); // )
  });

  it("should recognize FPU registers", () => {
    const { tokens } = tokenizeOperand("fp7");
    expect(tokens[0].type).toBe("register");
    expect(tokens[0].value).toBe("fp7");
    expect(tokens[1].type).toBe("eof");
  });

  it("should recognize special registers", () => {
    const { tokens } = tokenizeOperand("sr");
    expect(tokens[0].type).toBe("register");
    expect(tokens[0].value).toBe("sr");
    expect(tokens[1].type).toBe("eof");
  });
});
