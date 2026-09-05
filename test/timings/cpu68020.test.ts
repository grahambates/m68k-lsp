import parse from "../../src/parse";
import { CacheModels, Cpus } from "../../src/syntax";

const cpu = Cpus.MC68020;

// By default the 68020 reports the worst case (cache miss) as a single value per
// outcome: [clocks, reads, prefetches, writes]. Instructions with several
// runtime outcomes (branches, TRAPV, CAS) list one value per outcome, exactly
// like the 68000's taken/not-taken pair.

describe("68020 timings", () => {
  test("single worst-case value per instruction (no cache/worst pair)", () => {
    expect(parse(" add.l d0,d1", { cpu })[0].timing?.values).toEqual([
      [3, 0, 1, 0],
    ]);
    expect(parse(" move.l d0,d1", { cpu })[0].timing?.values).toEqual([
      [3, 0, 1, 0],
    ]);
  });

  test("--cache selects the cache-case figure", () => {
    const opts = { cpu, cacheModel: CacheModels.Cache };
    expect(parse(" add.l d0,d1", opts)[0].timing?.values).toEqual([
      [2, 0, 0, 0],
    ]);
    expect(parse(" move.w #256,d1", opts)[0].timing?.values).toEqual([
      [4, 0, 0, 0],
    ]);
  });

  test("folds fetch effective-address time into the base", () => {
    expect(parse(" add.w (a0),d1", { cpu })[0].timing?.values).toEqual([
      [7, 1, 1, 0],
    ]);
    expect(parse(" add.w d1,(a0)", { cpu })[0].timing?.values).toEqual([
      [10, 1, 1, 1],
    ]);
  });

  test("differs from the 68000, and keeps prefetch separate", () => {
    const [m68k] = parse(" add.w (a0),d1");
    const [m020] = parse(" add.w (a0),d1", { cpu });
    expect(m68k.timing?.values).toEqual([[8, 2, 0]]);
    expect(m020.timing?.values?.[0]).toHaveLength(4);
  });

  test("clr to memory folds calculate-EA time (not fetch)", () => {
    expect(parse(" clr.l (a0)", { cpu })[0].timing?.values).toEqual([
      [8, 0, 1, 1],
    ]);
  });

  test("shift count type: static vs dynamic", () => {
    expect(parse(" lsl.w #4,d0", { cpu })[0].timing?.values).toEqual([
      [4, 0, 1, 0],
    ]);
    expect(parse(" lsl.w d1,d0", { cpu })[0].timing?.values).toEqual([
      [6, 0, 1, 0],
    ]);
  });

  test("MOVE register to memory", () => {
    expect(parse(" move.l (a0)+,(a1)+", { cpu })[0].timing?.values).toEqual([
      [9, 1, 1, 1],
    ]);
  });

  test("MOVE to An is keyed under both MOVE and MOVEA", () => {
    expect(parse(" move.w d0,a1", { cpu })[0].timing?.values).toEqual([
      [3, 0, 1, 0],
    ]);
    expect(parse(" movea.l (a0),a1", { cpu })[0].timing?.values).toEqual([
      [7, 1, 1, 0],
    ]);
  });

  test("immediate-source move", () => {
    expect(parse(" move.w #256,d1", { cpu })[0].timing?.values).toEqual([
      [5, 0, 1, 0],
    ]);
    expect(parse(" move.l #$12345,d0", { cpu })[0].timing?.values).toEqual([
      [7, 0, 1, 0],
    ]);
    expect(parse(" move.b #7,d0", { cpu })[0].timing?.values).toEqual([
      [5, 0, 1, 0],
    ]);
  });

  test("immediate arithmetic to memory", () => {
    expect(parse(" andi.w #$07fe,4(a5)", { cpu })[0].timing?.values).toEqual([
      [13, 1, 2, 1],
    ]);
    expect(parse(" subi.l #1,(a0)", { cpu })[0].timing?.values).toEqual([
      [13, 1, 2, 1],
    ]);
    expect(parse(" cmpi.w #10,(a0)", { cpu })[0].timing?.values).toEqual([
      [4, 1, 1, 0],
    ]);
  });

  test("BCD / extended and bit ops", () => {
    expect(parse(" abcd -(a0),-(a1)", { cpu })[0].timing?.values).toEqual([
      [17, 2, 1, 1],
    ]);
    expect(parse(" bset d1,(a0)", { cpu })[0].timing?.values).toEqual([
      [9, 1, 1, 1],
    ]);
    expect(parse(" btst #3,4(a6)", { cpu })[0].timing?.values).toEqual([
      [12, 1, 2, 0],
    ]);
  });

  test("control, movem, movec/moves", () => {
    expect(parse(" rts", { cpu })[0].timing?.values).toEqual([[12, 1, 2, 0]]);
    expect(parse(" jsr (a0)", { cpu })[0].timing?.values).toEqual([
      [13, 0, 2, 1],
    ]);
    expect(parse(" lea 4(a0),a1", { cpu })[0].timing?.values).toEqual([
      [6, 0, 2, 0],
    ]);
    expect(parse(" movem.l d0-a6,-(sp)", { cpu })[0].timing?.values).toEqual([
      [50, 0, 1, 15],
    ]);
    expect(parse(" movec vbr,d0", { cpu })[0].timing?.values).toEqual([
      [7, 0, 1, 0],
    ]);
    expect(parse(" moves.l d0,(a0)", { cpu })[0].timing?.values).toEqual([
      [10, 0, 2, 1],
    ]);
  });

  test("bit field and 64-bit multiply", () => {
    expect(parse(" bftst d0{0:8}", { cpu })[0].timing?.values).toEqual([
      [7, 0, 1, 0],
    ]);
    expect(parse(" bfclr $dff180{0:8}", { cpu })[0].timing?.values).toEqual([
      [22, 1, 3, 1],
    ]);
    expect(parse(" mulu.l d0,d1:d2", { cpu })[0].timing?.values).toEqual([
      [47, 0, 2, 0],
    ]);
  });

  test("branch outcomes: taken / not-taken (like the 68000)", () => {
    const [bcc] = parse(" bne.w x", { cpu });
    expect(bcc.timing?.values).toEqual([
      [9, 0, 2, 0], // taken
      [7, 0, 1, 0], // not taken
    ]);
    expect(bcc.timing?.labels).toEqual(["Taken", "Not taken"]);
    // not-taken cost varies with the branch size
    expect(parse(" bne.b x", { cpu })[0].timing?.values).toEqual([
      [9, 0, 2, 0],
      [5, 0, 1, 0],
    ]);
    // dbcc has three outcomes
    expect(parse(" dbra d3,loop", { cpu })[0].timing?.values).toEqual([
      [9, 0, 2, 0],
      [7, 0, 1, 0],
      [10, 0, 3, 0],
    ]);
    // bsr is always taken -> single value
    expect(parse(" bsr sub", { cpu })[0].timing?.values).toEqual([
      [13, 0, 2, 1],
    ]);
  });

  test("branch outcomes respect the cache model", () => {
    const [bcc] = parse(" bne.w x", { cpu, cacheModel: CacheModels.Cache });
    expect(bcc.timing?.values).toEqual([
      [6, 0, 0, 0], // taken (cache)
      [6, 0, 0, 0], // not taken (cache)
    ]);
  });

  test("trapv outcomes: no-trap / trap", () => {
    const [result] = parse(" trapv", { cpu });
    expect(result.timing?.values).toEqual([
      [5, 0, 1, 0], // no trap
      [32, 1, 2, 5], // trap
    ]);
  });

  test("MACHINE directive selects the 68020 mid-file", () => {
    const lines = parse(`
\tadd.w\t(a0),d1
\tmachine\tmc68020
\tadd.w\t(a0),d1`);
    expect(lines[1].timing?.values).toEqual([[8, 2, 0]]);
    expect(lines[3].timing?.values).toEqual([[7, 1, 1, 0]]);
  });
});
