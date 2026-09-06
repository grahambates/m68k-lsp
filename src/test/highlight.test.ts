import { highlightAsm } from "../cli/format.js";

/**
 * Terminal syntax highlighting. The escape sequences occupy no columns, which
 * is what lets the caret underlining a diagnostic stay aligned with the line
 * above it.
 */
const ESC = "\u001b";
const CYAN = `${ESC}[36m`;
const BLUE = `${ESC}[34m`;
const YELLOW = `${ESC}[33m`;
const MAGENTA = `${ESC}[35m`;
const GREY = `${ESC}[90m`;
const OFF = `${ESC}[0m`;

const paint = (text: string, color: boolean = true) => highlightAsm(text, color);

/** The line with every escape sequence removed, as the terminal renders its width. */
const visible = (text: string) => text.replace(new RegExp(`${ESC}\\[\\d+m`, "g"), "");

describe("assembly highlighting", () => {
  test("colour is off unless asked for", () => {
    const line = "\tmove.l\t#100,d0\t; a comment";
    expect(highlightAsm(line, false)).toBe(line);
  });

  test("never changes the visible text", () => {
    for (const line of [
      "\tmove.l\t#100,d0",
      "SCREEN_BW\tequ\t320",
      "start:",
      "\tmuls.w\t#10,d0\t\t; scale by ten",
      "\tmove.w\t#DMAF_SETCLR!DMAF_COPPER,$dff096",
      "\tlea\tSCREEN_BW/2(a3),a3",
      "* a banner comment",
      "",
      "   ",
    ]) {
      expect(visible(paint(line))).toBe(line);
    }
  });

  test("splits the mnemonic from its size qualifier", () => {
    expect(paint("\tmove.l\td0,d1")).toContain(`${CYAN}move${OFF}${BLUE}.l${OFF}`);
  });

  test("a mnemonic with no size is left whole", () => {
    expect(paint("\tdbf\td7,.loop")).toContain(`${CYAN}dbf${OFF}`);
    expect(paint("\tdbf\td7,.loop")).not.toContain(BLUE);
  });

  test("registers, literals and punctuation each get their own colour", () => {
    const out = paint("\tmove.l\t#100,d0");
    expect(out).toContain(`${MAGENTA}100${OFF}`);
    expect(out).toContain(`${YELLOW}d0${OFF}`);
    expect(out).toContain(`${GREY}#${OFF}`);
    expect(out).toContain(`${GREY},${OFF}`);
  });

  test("numbers are recognised in every base an assembler takes", () => {
    expect(paint("\tmove.w\t#$dff096,d0")).toContain(`${MAGENTA}$dff096${OFF}`);
    expect(paint("\tmove.w\t#%1010,d0")).toContain(`${MAGENTA}%1010${OFF}`);
    expect(paint("\tmove.w\t#@777,d0")).toContain(`${MAGENTA}@777${OFF}`);
  });

  // The names carrying the meaning stay the most readable thing on the line.
  test("symbols and labels are left uncoloured", () => {
    expect(paint("\tlea\tSCREEN_BW(a3),a3")).toContain("SCREEN_BW");
    expect(paint("\tlea\tSCREEN_BW(a3),a3")).not.toContain(`${CYAN}SCREEN_BW`);
    expect(paint("start:")).toBe("start:");
  });

  describe("labels only exist in column zero", () => {
    test("an indented mnemonic is not mistaken for a label", () => {
      expect(paint("\tmuls.w\t#10,d0")).toContain(`${CYAN}muls${OFF}`);
    });

    test("a column-zero label leaves the operation after it coloured", () => {
      const out = paint("SCREEN_BW\tequ\t320");
      expect(out).toContain(`${CYAN}equ${OFF}`);
      expect(out.startsWith("SCREEN_BW")).toBe(true);
    });

    test("a label and an instruction on one line", () => {
      const out = paint("start:\tmove.l\t#1,d0");
      expect(out.startsWith("start:")).toBe(true);
      expect(out).toContain(`${CYAN}move${OFF}${BLUE}.l${OFF}`);
    });
  });

  describe("comments", () => {
    test("a trailing comment is dimmed whole", () => {
      expect(paint("\tnop\t; explain")).toContain(`${GREY}; explain${OFF}`);
    });

    test("a banner comment in column zero is dimmed whole", () => {
      expect(paint("* a banner comment")).toBe(`${GREY}* a banner comment${OFF}`);
    });

    test("a semicolon inside a string does not start a comment", () => {
      const out = paint('\tdc.b\t"a;b",0');
      expect(out).toContain(`${MAGENTA}"a;b"${OFF}`);
      expect(out).not.toContain(`${GREY};b"`);
    });
  });
});
