import parse from "../../src/parse";
import { Mnemonics } from "../../src/syntax";
import {
  formatTiming,
  rangeN,
  popCount,
  timingLabels,
} from "../../src/timings";

describe("timings", () => {
  test("move", () => {
    const [result] = parse(" move.w d0,d1");
    expect(result.timing.values).toEqual([[4, 1, 0]]);
  });

  test("EA source", () => {
    const [result] = parse(" add.w (a0),d1");
    expect(result.timing.values).toEqual([[8, 2, 0]]);
  });

  test("EA dest", () => {
    const [result] = parse(" add.w d1,(a0)");
    expect(result.timing.values).toEqual([[12, 2, 1]]);
  });

  test("movem n multiplier - source", () => {
    const [result] = parse(" movem.l d0-a6,-(sp)");
    const n = 15;
    expect(result.timing.values).toEqual([[8 + 8 * n, 2, 2 * n]]);
  });

  test("movem n multiplier - dest", () => {
    const [result] = parse(" movem.l DrawBuffer(PC),a2-a3");
    const n = 2;
    expect(result.timing.values).toEqual([[16 + 8 * n, 4 + 2 * n, 0]]);
  });

  test("shift n multiplier", () => {
    const [result] = parse(" lsl.w #4,d0");
    const n = 4;
    expect(result.timing.values).toEqual([[6 + 2 * n, 1, 0]]);
  });

  test("shift n multiplier unresolved", () => {
    const [result] = parse(" lsl.w #unresolved,d0");
    const minN = 1;
    const maxN = 8;
    expect(result.timing.values).toEqual([
      [6 + 2 * minN, 1, 0],
      [6 + 2 * maxN, 1, 0],
    ]);
  });

  test("shift n multiplier - single", () => {
    const [result] = parse(" lsl.w d0");
    const n = 1;
    expect(result.timing.values).toEqual([[6 + 2 * n, 1, 0]]);
  });

  test("shift n multiplier - register", () => {
    const [result] = parse(" lsl.w d0,d1");
    const minN = 0;
    const maxN = 63;
    expect(result.timing.values).toEqual([
      [6 + 2 * minN, 1, 0],
      [6 + 2 * maxN, 1, 0],
    ]);
  });

  test("btst register -> immediate", () => {
    const [result] = parse(" btst.b d0,#1");
    expect(result.timing.values).toEqual([[10, 2, 0]]);
  });

  test("mulu best case", () => {
    const [result] = parse(" mulu #0,d0");
    expect(result.timing.values).toEqual([[42, 2, 0]]);
  });

  test("mulu worst case", () => {
    const [result] = parse(" mulu #$ffff,d0");
    expect(result.timing.values).toEqual([[74, 2, 0]]);
  });

  test("muls best case", () => {
    const [result] = parse(" muls #0,d0");
    expect(result.timing.values).toEqual([[42, 2, 0]]);
  });

  test("muls worst case", () => {
    const [result] = parse(" muls #$5555,d0");
    expect(result.timing.values).toEqual([[74, 2, 0]]);
  });

  test("muls range", () => {
    const [result] = parse(" muls d0,d1");
    expect(result.timing.values).toEqual([
      [38, 1, 0],
      [70, 1, 0],
    ]);
  });

  test("nop", () => {
    const [result] = parse(" nop");
    expect(result.timing.values).toEqual([[4, 1, 0]]);
  });

  test("movem - single data src", () => {
    const [result] = parse(" movem.w d0,(a0)");
    expect(result.timing.values).toEqual([[12, 2, 1]]);
  });

  test("movem - single address src", () => {
    const [result] = parse(" movem.w a0,(a0)");
    expect(result.timing.values).toEqual([[12, 2, 1]]);
  });

  test("movem - single data dest", () => {
    const [result] = parse(" movem.w (a0),d0");
    expect(result.timing.values).toEqual([[16, 4, 0]]);
  });

  test("movem - single address dest", () => {
    const [result] = parse(" movem.w (a0),a0");
    expect(result.timing.values).toEqual([[16, 4, 0]]);
  });
});

describe("formatTiming", () => {
  test("formats a timing", () => {
    const result = formatTiming([4, 2, 1]);
    expect(result).toBe("4(2/1)");
  });
});

describe("rangeCount", () => {
  test("single range", () => {
    expect(rangeN("d0-d4")).toEqual(5);
  });

  test("multiple regs", () => {
    expect(rangeN("d0/d4/d6")).toEqual(3);
  });

  test("two ranges", () => {
    expect(rangeN("d0-d4/a0-a2")).toEqual(8);
  });

  test("mixed", () => {
    expect(rangeN("d0-d4/d6/a0-a2/a4")).toEqual(10);
  });

  test("combined range", () => {
    expect(rangeN("d0-a6")).toEqual(15);
  });

  test("popCount", () => {
    expect(popCount(0)).toEqual(0);
    expect(popCount(0b1101)).toEqual(3);
    expect(popCount(0x5555)).toEqual(8);
  });
});

describe("timingLabels", () => {
  test("BCC", () => {
    const result = timingLabels(Mnemonics.BLT);
    expect(result).toEqual(["Taken", "Not taken"]);
  });

  test("DBCC", () => {
    const result = timingLabels(Mnemonics.DBCS);
    expect(result).toEqual(["Taken", "Not taken", "Expired"]);
  });

  test("CHK", () => {
    const result = timingLabels(Mnemonics.CHK);
    expect(result).toEqual(["No trap", "Trap >", "Trap <"]);
  });

  test("TRAPV", () => {
    const result = timingLabels(Mnemonics.TRAPV);
    expect(result).toEqual(["No trap", "Trap"]);
  });

  test("Default", () => {
    const result = timingLabels(Mnemonics.MULS);
    expect(result).toEqual(["Min", "Max"]);
  });
});
