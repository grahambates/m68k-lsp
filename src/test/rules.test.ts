import { lintSource } from "../core/lint.js";

function ids(source: string): string[] {
  return lintSource(source).map((d) => d.ruleId);
}

describe("optimization rules", () => {
  test("prefers MOVEQ for signed 8-bit long immediates", () => {
    expect(ids("move.l #42,d3")).toContain("optimization/prefer-moveq");
    expect(ids("move.l #-128,d7")).toContain("optimization/prefer-moveq");
    expect(ids("move.l #128,d0")).not.toContain("optimization/prefer-moveq");
    expect(ids("move.w #1,d0")).not.toContain("optimization/prefer-moveq");
  });

  test("prefers MOVEQ when an EQU expression resolves to the range", () => {
    const source = [
      "answer equ 40+2",
      "move.l #answer,d0",
    ].join("\n");

    expect(ids(source)).toContain("optimization/prefer-moveq");
  });

  test("resolves chained EQU constants", () => {
    const source = [
      "base equ 40",
      "answer equ base+2",
      "move.l #answer,d0",
    ].join("\n");

    expect(ids(source)).toContain("optimization/prefer-moveq");
  });

  test("prefers ADDQ for immediates 1..8", () => {
    expect(ids("add.l #1,d0")).toContain("optimization/prefer-addq");
    expect(ids("addi.l #1,d0")).toContain("optimization/prefer-addq");
    expect(ids("add.w #8,(a0)")).toContain("optimization/prefer-addq");
    expect(ids("add.l #9,d0")).not.toContain("optimization/prefer-addq");
    expect(ids("add.b #1,a0")).not.toContain("optimization/prefer-addq");
  });


  test("matches address-register instruction families where rules opt in", () => {
    expect(ids("adda.l #100,a0")).toContain("optimization/address-add-to-lea");
    expect(ids("suba.l #100,a0")).toContain("optimization/address-sub-to-lea");
  });

  test("detects redundant LEA only when registers match", () => {
    expect(ids("lea (a0),a0")).toContain("optimization/redundant-lea");
    expect(ids("lea (a0),a1")).not.toContain("optimization/redundant-lea");
  });

  test("detects a null BRA across blank/comment-only lines", () => {
    const source = [
      "bra .next",
      "; comment",
      "",
      ".next:",
      "move.l d0,d1",
    ].join("\n");

    expect(ids(source)).toContain("optimization/null-branch");
  });

  test("does not flag BRA when a statement occurs before the target", () => {
    const source = [
      "bra .next",
      "move.l d0,d1",
      ".next:",
    ].join("\n");

    expect(ids(source)).not.toContain("optimization/null-branch");
  });

  test("uses ADDQ/SUBQ for small same-register LEA displacements", () => {
    const positive = lintSource("lea 6(a2),a2").find((d) => d.ruleId === "optimization/prefer-lea-quick");
    expect(positive?.suggestion?.replacement).toBe("addq.w #6,a2");

    const negative = lintSource("lea -3(a4),a4").find((d) => d.ruleId === "optimization/prefer-lea-quick");
    expect(negative?.suggestion?.replacement).toBe("subq.w #3,a4");

    expect(ids("lea 6(a2),a3")).not.toContain("optimization/prefer-lea-quick");
    expect(ids("lea 9(a2),a2")).not.toContain("optimization/prefer-lea-quick");
  });

  test("detects JSR/BSR followed by RTS as manual tail-call candidates", () => {
    expect(ids(["jsr helper", "rts"].join("\n"))).toContain("optimization/jsr-rts-tail-call");
    expect(ids(["bsr helper", "rts"].join("\n"))).toContain("optimization/bsr-rts-tail-call");

    const diagnostic = lintSource(["jsr helper", "rts"].join("\n")).find((d) => d.ruleId === "optimization/jsr-rts-tail-call");
    expect(diagnostic?.suggestion?.applicability).toBe("manual");
  });

  test("folds address-register push plus immediate stack adjustment into PEA", () => {
    const source = [
      "move.l a0,-(sp)",
      "add.l #12,(sp)",
      "move.l d1,d2",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/push-address-pea");
    expect(diagnostic?.suggestion?.replacement).toBe("pea 12(a0)");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("PEA folding remains conditional when original arithmetic flags escape", () => {
    const source = [
      "move.l a1,-(sp)",
      "sub.l #4,(sp)",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/push-address-pea");
    expect(diagnostic?.suggestion?.replacement).toBe("pea -4(a1)");
    expect(diagnostic?.suggestion?.applicability).toBe("conditional");
  });


  test("uses MOVEQ #0 for CLR.L Dn on 68000 targets", () => {
    const diagnostic = lintSource("clr.l d3").find((d) => d.ruleId === "optimization/prefer-moveq-zero");
    expect(diagnostic?.suggestion?.replacement).toBe("moveq #0,d3");

    const laterCpu = lintSource("clr.l d3", { processors: ["mc68040"] });
    expect(laterCpu.map((d) => d.ruleId)).not.toContain("optimization/prefer-moveq-zero");
  });

  test("uses ST for MOVE.B #-1 when CCR differences are dead", () => {
    const source = ["move.b #-1,(a0)", "move.l d0,d1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/prefer-st-minus-one");
    expect(diagnostic?.suggestion?.replacement).toBe("st (a0)");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("keeps ST conversion conditional when MOVE flags escape", () => {
    const source = ["move.b #-1,d0", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/prefer-st-minus-one");
    expect(diagnostic?.suggestion?.applicability).toBe("conditional");
  });

  test("suggests ADD for a one-bit left shift only on supported target set", () => {
    expect(ids("lsl.w #1,d2")).toContain("optimization/prefer-add-for-shift-one");
    const cpu060 = lintSource("lsl.w #1,d2", { processors: ["mc68060"] });
    expect(cpu060.map((d) => d.ruleId)).not.toContain("optimization/prefer-add-for-shift-one");
  });

  test("shrinks signed 16-bit immediate loads to address registers", () => {
    const diagnostic = lintSource("move.l #1234,a2").find((d) => d.ruleId === "optimization/prefer-move-word-address");
    expect(diagnostic?.suggestion?.replacement).toBe("move.w #1234,a2");
    expect(ids("move.l #40000,a2")).not.toContain("optimization/prefer-move-word-address");
  });

  test("zeros an address register with SUBA.L", () => {
    const diagnostic = lintSource("move.l #0,a3").find((d) => d.ruleId === "optimization/zero-address-register");
    expect(diagnostic?.suggestion?.replacement).toBe("suba.l a3,a3");
    expect(ids("move.l #0,a3")).not.toContain("optimization/prefer-move-word-address");
  });

  test("uses word-sized ADDQ/SUBQ on address registers for 68000/68010", () => {
    expect(ids("addq.l #4,a0")).toContain("optimization/addq-address-word-size");
    expect(ids("subq.l #2,a1")).toContain("optimization/subq-address-word-size");
    const laterCpu = lintSource("addq.l #4,a0", { processors: ["mc68030"] });
    expect(laterCpu.map((d) => d.ruleId)).not.toContain("optimization/addq-address-word-size");
  });

  test("recognises standard LINK and UNLK sequences", () => {
    const setup = [
      "move.l a6,-(sp)",
      "move.l sp,a6",
      "add.w #-32,sp",
    ].join("\n");
    const link = lintSource(setup).find((d) => d.ruleId === "optimization/prefer-link-sequence");
    expect(link?.suggestion?.replacement).toBe("link a6,#-32");

    const teardown = [
      "move.l a6,sp",
      "move.l (sp)+,a6",
      "rts",
    ].join("\n");
    const unlk = lintSource(teardown).find((d) => d.ruleId === "optimization/prefer-unlk-sequence");
    expect(unlk?.suggestion?.replacement).toBe("unlk a6");
  });

});


  test("DIVU.W power-of-two proves discarded remainder when upper word is overwritten", () => {
    const source = [
      "move.l #100,d0",
      "divu.w #4,d0",
      "move.w d0,d1",
      "move.l #0,d0",
      "move.l d2,d3",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/divu-word-power-of-two");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.data?.upperWordUse).toBe("unused");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("DIVU.W power-of-two does not suggest a shift when the remainder word is definitely used", () => {
    const source = [
      "divu.w #4,d0",
      "swap d0",
      "move.l d0,d1",
      "rts",
    ].join("\n");
    expect(ids(source)).not.toContain("optimization/divu-word-power-of-two");
  });

  test("DIVU.W power-of-two remains manual when remainder use is unknown", () => {
    const source = ["divu.w #4,d0", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/divu-word-power-of-two");
    expect(diagnostic?.data?.upperWordUse).toBe("unknown");
    expect(diagnostic?.suggestion?.applicability).toBe("manual");
  });



describe("Flamewing address sequence rules", () => {
  test("folds ADDA immediate plus data-register ADDA into indexed LEA", () => {
    const source = ["adda.w #12,a0", "adda.l d1,a0", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/address-arithmetic-indexed-lea");
    expect(diagnostic?.suggestion?.replacement).toBe("lea 12(a0,d1.l),a0");
  });

  test("folds SUBA immediate plus address-register ADDA into indexed LEA", () => {
    const source = ["suba.w #8,a0", "adda.w a1,a0", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/address-arithmetic-indexed-lea");
    expect(diagnostic?.suggestion?.replacement).toBe("lea -8(a0,a1.w),a0");
  });

  test("does not fold when the index is the destination address register", () => {
    expect(ids(["adda.w #4,a0", "adda.l a0,a0", "rts"].join("\n"))).not.toContain("optimization/address-arithmetic-indexed-lea");
  });
});

describe("Flamewing rotate and shift rules", () => {
  test("reduces known register-count word rotates", () => {
    const source = ["moveq #12,d1", "rol.w d1,d0", "move.l #0,d1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/known-register-rotate");
    expect(diagnostic?.suggestion?.replacement).toBe("ror.w #4,d0");
  });

  test("reduces known register-count long rotates through SWAP", () => {
    const source = ["moveq #20,d1", "ror.l d1,d0", "move.l #0,d1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/known-register-rotate");
    expect(diagnostic?.suggestion?.replacement).toBe("swap d0\nror.l #4,d0");
  });

  test("does not delete a MOVEQ whose count register remains live", () => {
    const source = ["moveq #12,d1", "rol.w d1,d0", "move.l d1,d2", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/known-register-rotate");
  });

  test("uses ADDX for ROXL #1", () => {
    const diagnostic = lintSource(["roxl.w #1,d0", "move.w d0,d1", "rts"].join("\n")).find((d) => d.ruleId === "optimization/roxl-to-addx");
    expect(diagnostic?.suggestion?.replacement).toBe("addx.w d0,d0");
  });

  test("recognises the LSL.B #7 rotate-and-mask speed tradeoff", () => {
    const diagnostic = lintSource(["lsl.b #7,d0", "move.b d0,d1", "rts"].join("\n")).find((d) => d.ruleId === "optimization/lsl-byte-seven");
    expect(diagnostic?.suggestion?.replacement).toBe("ror.b #1,d0\nandi.b #$80,d0");
  });

  test("reduces known register-count LSL.W #12 using rotate and mask", () => {
    const source = ["moveq #12,d1", "lsl.w d1,d0", "move.l #0,d1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/known-register-shift-reduction");
    expect(diagnostic?.suggestion?.replacement).toBe("ror.w #4,d0\nandi.w #$F000,d0");
  });

  test("reduces known register-count LSR.W #12 using mask and rotate", () => {
    const source = ["moveq #12,d1", "lsr.w d1,d0", "move.l #0,d1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/known-register-shift-reduction");
    expect(diagnostic?.suggestion?.replacement).toBe("andi.w #$F000,d0\nrol.w #4,d0");
  });

  test("reduces known register-count LSL.L #20 using word/SWAP operations", () => {
    const source = ["moveq #20,d1", "lsl.l d1,d0", "move.l #0,d1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/known-register-shift-reduction");
    expect(diagnostic?.suggestion?.replacement).toBe("lsl.w #4,d0\nswap d0\nclr.w d0");
  });

  test("reduces known register-count ASR.L #16 using SWAP/EXT", () => {
    const source = ["moveq #16,d1", "asr.l d1,d0", "move.l #0,d1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/known-register-shift-reduction");
    expect(diagnostic?.suggestion?.replacement).toBe("swap d0\next.l d0");
  });

  test("does not reduce a register-count shift when the count register remains live", () => {
    const source = ["moveq #20,d1", "lsl.l d1,d0", "move.l d1,d2", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/known-register-shift-reduction");
  });
});

describe("suspicious rules", () => {
  test("flags register self-MOVE without claiming it is safe to remove", () => {
    const diagnostics = lintSource("move.l d2,d2");
    const diagnostic = diagnostics.find((d) => d.ruleId === "suspicious/self-move");

    expect(diagnostic).toBeDefined();
    expect(diagnostic?.suggestion?.applicability).toBe("manual");
    expect(diagnostic?.notes?.some((note) => /condition codes/i.test(note.message))).toBe(true);
  });

  test("does not flag ordinary MOVE", () => {
    expect(ids("move.l d2,d3")).not.toContain("suspicious/self-move");
  });

  test("NOP advisory is disabled by default", () => {
    expect(ids("nop")).not.toContain("suspicious/nop");
  });

  test("NOP advisory can be explicitly enabled", () => {
    const diagnostics = lintSource("nop", {
      processors: ["mc68000"],
      rules: { "suspicious/nop": "info" },
    });

    expect(diagnostics.map((d) => d.ruleId)).toContain("suspicious/nop");
  });
});

describe("configuration", () => {
  test("category can be disabled", () => {
    const diagnostics = lintSource("move.l #1,d0", {
      processors: ["mc68000"],
      categories: { optimization: false },
    });
    expect(diagnostics).toHaveLength(0);
  });
});

describe("CCR analysis", () => {
  test("flags are live when consumed before overwrite", () => {
    const source = [
      "cmp.l d0,d1",
      "movea.l (a0),a1",
      "beq .same",
      ".same:",
      "rts",
    ].join("\n");

    const diagnostics = lintSource(source);
    expect(diagnostics.map((d) => d.ruleId)).not.toContain("correctness/stale-condition-code");
  });

  test("flags become unknown at RTS if they survive to return", async () => {
    const { parseFile } = await import("m68k-parser");
    const { DefaultRuleContext } = await import("../core/context.js");
    const file = parseFile(["add.l d0,d1", "rts"].join("\n"));
    const ctx = new DefaultRuleContext(file, ["add.l d0,d1", "rts"].join("\n"), { processors: ["mc68000"] });
    expect(ctx.flags.isLiveAfter(0, "Z")).toBe("unknown");
  });

  test("a definite overwrite before RTS makes the older NZVC dead", async () => {
    const { parseFile } = await import("m68k-parser");
    const { DefaultRuleContext } = await import("../core/context.js");
    const source = ["add.l d0,d1", "move.l d2,d3", "rts"].join("\n");
    const ctx = new DefaultRuleContext(parseFile(source), source, { processors: ["mc68000"] });
    expect(ctx.flags.isLiveAfter(0, "Z")).toBe("dead");
    // MOVE preserves X, so ADD's X can still escape through RTS.
    expect(ctx.flags.isLiveAfter(0, "X")).toBe("unknown");
  });

  test("flags become unknown across a call with no summary", async () => {
    const { parseFile } = await import("m68k-parser");
    const { DefaultRuleContext } = await import("../core/context.js");
    const source = ["cmp.l d0,d1", "jsr helper", "beq .same", ".same:", "rts"].join("\n");
    const ctx = new DefaultRuleContext(parseFile(source), source, { processors: ["mc68000"] });
    expect(ctx.flags.reachingDefinitionsBefore(2, "Z").some((d) => d.kind === "unknown")).toBe(true);
  });

  test("warns when BEQ appears to expect MOVEA to set Z", () => {
    const source = [
      "movea.l d0,a0",
      "beq .null",
      ".null:",
      "rts",
    ].join("\n");
    expect(ids(source)).toContain("correctness/stale-condition-code");
  });

  test("does not warn when MOVEA deliberately preserves a prior CMP result", () => {
    const source = [
      "cmp.l d0,d1",
      "movea.l (a0),a1",
      "beq .equal",
      ".equal:",
      "rts",
    ].join("\n");
    expect(ids(source)).not.toContain("correctness/stale-condition-code");
  });

  test("populates quick arithmetic and simple constant rules", () => {
    const source = [
      "sub.l #8,d0",
      "add.w #-3,d1",
      "sub.l #-7,d2",
      "cmp.l #0,d3",
      "eor.l #-1,d4",
    ].join("\n");
    const found = ids(source);
    expect(found).toContain("optimization/prefer-subq");
    expect(found).toContain("optimization/prefer-subq-negative-add");
    expect(found).toContain("optimization/prefer-addq-negative-sub");
    expect(found).toContain("optimization/prefer-tst-zero");
    expect(found).toContain("optimization/prefer-not");
  });

  test("single-bit mask transforms are conditional when later flags may matter", () => {
    const source = [
      "or.l #8,d0",
      "beq .done",
      ".done:",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/prefer-bset");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.suggestion?.applicability).toBe("conditional");
  });

  test("single-bit mask transform becomes safe after flags are overwritten", () => {
    const source = [
      "or.l #8,d0",
      "move.l d1,d2",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/prefer-bset");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("large logical shifts can collapse to zero, respecting CCR liveness", () => {
    const source = [
      "lsl.w #16,d0",
      "move.l d1,d2",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/shift-to-clear");
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.suggestion?.replacement).toBe("clr.w d0");
  });

});

describe("v0.8 sequence rules", () => {
  test("uses TST plus sign branch for BTST sign-bit tests", () => {
    const source = [
      "btst #31,d0",
      "beq.s .positive",
      "move.l d1,d2",
      ".positive:",
      "move.l d3,d4",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/btst-sign-branch");
    expect(diagnostic?.suggestion?.replacement).toBe("tst.l d0\nbpl.s .positive");
  });

  test("does not fold BTST branch across an independently reachable label", () => {
    const source = ["btst #7,d0", ".branch:", "bne .negative"].join("\n");
    expect(ids(source)).not.toContain("optimization/btst-sign-branch");
  });

  test("finds adjacent absolute CLR byte/word stores but keeps them manual", () => {
    const bytes = lintSource(["clr.b $1000", "clr.b $1001"].join("\n"))
      .find((d) => d.ruleId === "optimization/combine-adjacent-clr-bytes");
    expect(bytes?.suggestion?.applicability).toBe("manual");

    expect(ids(["clr.w $2000", "clr.w $2002"].join("\n")))
      .toContain("optimization/combine-adjacent-clr-words");
  });

  test("combines adjacent immediate stores using 68k big-endian ordering", () => {
    const bytes = lintSource(["move.b #$12,$1000", "move.b #$34,$1001"].join("\n"))
      .find((d) => d.ruleId === "optimization/combine-adjacent-move-bytes");
    expect(bytes?.suggestion?.description).toContain("#$1234");
    expect(bytes?.suggestion?.applicability).toBe("manual");

    const words = lintSource(["move.w #$1234,$2000", "move.w #$5678,$2002"].join("\n"))
      .find((d) => d.ruleId === "optimization/combine-adjacent-move-words");
    expect(words?.suggestion?.description).toContain("#$12345678");
  });
});

describe("v0.9 local peepholes", () => {
  test("does not suggest TST for address-register CMP #0", () => {
    expect(ids("cmp.l #0,a0")).not.toContain("optimization/prefer-tst-zero");
    expect(ids("cmp.l #0,d0")).toContain("optimization/prefer-tst-zero");
  });

  test("removes zero address-register displacements", () => {
    const diagnostic = lintSource("move.l 0(a0),d0").find((d) => d.ruleId === "optimization/redundant-zero-displacement");
    expect(diagnostic?.suggestion?.replacement).toBe("(a0)");
  });

  test("uses LEA for larger immediate address-register arithmetic", () => {
    expect(lintSource("add.l #100,a2").find((d) => d.ruleId === "optimization/address-add-to-lea")?.suggestion?.replacement)
      .toBe("lea 100(a2),a2");
    expect(lintSource("sub.w #20,a3").find((d) => d.ruleId === "optimization/address-sub-to-lea")?.suggestion?.replacement)
      .toBe("lea -20(a3),a3");
    expect(ids("add.l #8,a2")).not.toContain("optimization/address-add-to-lea");
  });

  test("uses PEA for signed-16-bit immediate pushes but respects CCR", () => {
    const safe = lintSource(["move.l #123,-(sp)", "move.l d0,d1", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/push-immediate-pea");
    expect(safe?.suggestion?.replacement).toBe("pea 123.w");
    expect(safe?.suggestion?.applicability).toBe("safe");

    const escaping = lintSource(["move.l #123,-(sp)", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/push-immediate-pea");
    expect(escaping?.suggestion?.applicability).toBe("conditional");
  });

  test("reduces single-register MOVEM but rejects MOVEM.W to Dn", () => {
    expect(ids("movem.l d0,(a0)")).toContain("optimization/single-register-movem");
    expect(ids("movem.w (a0),d0")).not.toContain("optimization/single-register-movem");
  });

  test("uses low-word masks for BSET/BCLR when CCR differences are dead", () => {
    const source = ["bset.l #3,d0", "move.l d1,d2", "rts"].join("\n");
    const bset = lintSource(source).find((d) => d.ruleId === "optimization/bset-low-word-mask");
    expect(bset?.suggestion?.replacement).toBe("or.w #$0008,d0");
    expect(bset?.suggestion?.applicability).toBe("safe");

    expect(lintSource("bclr.l #7,d1").find((d) => d.ruleId === "optimization/bclr-low-word-mask")?.suggestion?.replacement)
      .toBe("and.w #$FF7F,d1");
  });

  test("suggests two ADDs for two-bit byte/word shifts on supported CPUs", () => {
    const diagnostic = lintSource(["asl.w #2,d2", "move.l d0,d1", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/shift-two-adds");
    expect(diagnostic?.suggestion?.replacement).toBe("add.w d2,d2\nadd.w d2,d2");

    const cpu060 = lintSource("asl.w #2,d2", { processors: ["mc68060"] });
    expect(cpu060.map((d) => d.ruleId)).not.toContain("optimization/shift-two-adds");
  });

  test("extends BTST sign-branch folding to memory bit 7", () => {
    const source = ["btst #7,(a0)", "beq .positive", "move.l d0,d1", ".positive:", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/btst-sign-branch");
    expect(diagnostic?.suggestion?.replacement).toBe("tst.b (a0)\nbpl .positive");
  });
});

describe("ASP68K coverage manifest", () => {
  test("every implemented manifest rule exists in the default registry", async () => {
    const { asp68kCoverage } = await import("../coverage-asp68k.js");
    const { defaultRules } = await import("../rules/index.js");
    const ids = new Set(defaultRules.map((r) => r.meta.id));
    for (const entry of asp68kCoverage) {
      if (entry.status === "implemented" && entry.rule) expect(ids.has(entry.rule)).toBe(true);
    }
  });
});

describe("register analysis", () => {
  test("tracks a known-zero data register into a CLR optimisation", () => {
    const source = [
      "moveq #0,d7",
      "clr.l -(a0)",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/known-zero-clear");
    expect(diagnostic?.suggestion?.replacement).toBe("move.l d7,-(a0)");
    expect(diagnostic?.suggestion?.applicability).toBe("conditional");
  });

  test("does not assume a register is dead merely because the routine returns", async () => {
    const { parseFile } = await import("m68k-parser");
    const { DefaultRuleContext } = await import("../core/context.js");
    const source = ["move.l #42,(a0)", "rts"].join("\n");
    const ctx = new DefaultRuleContext(parseFile(source), source, { processors: ["mc68000"] });
    expect(ctx.registers.isLiveAfter(0, "d0")).toBe("unknown");
  });

  test("finds a dead scratch register when it is overwritten before return", () => {
    const source = [
      "move.l #42,(a0)",
      "moveq #0,d0",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/move-immediate-via-scratch");
    expect(diagnostic?.suggestion?.replacement).toContain("moveq #42,d0");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });
});

describe("v0.11 register-driven rules", () => {
  test("uses a dead data register to compare an address register with zero", () => {
    const source = [
      "cmp.l #0,a0",
      "moveq #1,d0",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/cmp-zero-address-via-scratch");
    expect(diagnostic?.suggestion?.replacement).toBe("move.l a0,d0");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("does not apply the address-register scratch comparison to CMP.W", () => {
    expect(ids("cmp.w #0,a0")).not.toContain("optimization/cmp-zero-address-via-scratch");
  });

  test("combines consecutive ADDQ.L operations when flags are dead", () => {
    const source = [
      "addq.l #3,d0",
      "addq.l #5,d0",
      "move.l d1,d2",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/combine-consecutive-addq");
    expect(diagnostic?.suggestion?.replacement).toBe("addq.l #8,d0");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("does not use the full-immediate ADD fallback on mc68000 when the sum exceeds 8", () => {
    const source = [
      "addq.l #5,d0",
      "addq.l #6,d0",
      "move.l d1,d2",
      "rts",
    ].join("\n");
    expect(lintSource(source, { processors: ["mc68000"] }).map((d) => d.ruleId))
      .not.toContain("optimization/combine-consecutive-addq");
  });

  test("retains the source-backed full-immediate ADD fallback for mc68030", () => {
    const source = [
      "addq.l #5,d0",
      "addq.l #6,d0",
      "move.l d1,d2",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source, { processors: ["mc68030"] })
      .find((d) => d.ruleId === "optimization/combine-consecutive-addq");
    expect(diagnostic?.suggestion?.replacement).toBe("add.l #11,d0");
  });

  test("keeps combined ADDQ conditional when carry/overflow flags are observed", () => {
    const source = [
      "addq.l #3,d0",
      "addq.l #5,d0",
      "bcs .carry",
      ".carry:",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/combine-consecutive-addq");
    expect(diagnostic?.suggestion?.applicability).toBe("conditional");
  });

  test("tracks constants through simple full-register arithmetic", async () => {
    const { parseFile } = await import("m68k-parser");
    const { DefaultRuleContext } = await import("../core/context.js");
    const source = ["moveq #4,d7", "sub.l #4,d7", "clr.l -(a0)", "rts"].join("\n");
    const ctx = new DefaultRuleContext(parseFile(source), source, { processors: ["mc68000"] });
    expect(ctx.registers.knownConstantBefore(2, "d7")).toBe(0);
  });

  test("MOVEM register lists participate in register liveness", async () => {
    const { parseFile } = await import("m68k-parser");
    const { DefaultRuleContext } = await import("../core/context.js");
    const source = ["move.l #42,(a0)", "movem.l d0-d2,-(sp)", "rts"].join("\n");
    const ctx = new DefaultRuleContext(parseFile(source), source, { processors: ["mc68000"] });
    expect(ctx.registers.isLiveAfter(0, "d0")).toBe("live");
  });
});


describe("v0.12 simple multiply rules", () => {
  test("replaces signed/unsigned word multiply by zero with MOVEQ", () => {
    expect(lintSource("muls.w #0,d2").find((d) => d.ruleId === "optimization/multiply-word-by-zero")?.suggestion?.replacement)
      .toBe("moveq #0,d2");
    expect(ids("mulu.w #0,d3")).toContain("optimization/multiply-word-by-zero");
  });

  test("replaces signed word multiply by one with EXT.L", () => {
    const diagnostic = lintSource("muls.w #1,d4").find((d) => d.ruleId === "optimization/muls-word-by-one");
    expect(diagnostic?.suggestion?.replacement).toBe("ext.l d4");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("offers the unsigned multiply-by-one zero-extension sequence only on useful targets", () => {
    const diagnostic = lintSource("mulu.w #1,d5").find((d) => d.ruleId === "optimization/mulu-word-by-one");
    expect(diagnostic?.suggestion?.replacement).toBe("swap d5\nclr.w d5\nswap d5");
    expect(lintSource("mulu.w #1,d5", { processors: ["mc68060"] }).map((d) => d.ruleId))
      .not.toContain("optimization/mulu-word-by-one");
  });

  test("uses EXT+ASL for signed word powers of two and respects flag liveness", () => {
    const safeSource = ["muls.w #8,d0", "move.l d1,d2", "rts"].join("\n");
    const safe = lintSource(safeSource).find((d) => d.ruleId === "optimization/muls-word-power-of-two");
    expect(safe?.suggestion?.replacement).toBe("ext.l d0\nasl.l #3,d0");
    expect(safe?.suggestion?.applicability).toBe("safe");

    const liveSource = ["muls.w #8,d0", "bvs .overflow", ".overflow:", "rts"].join("\n");
    const live = lintSource(liveSource).find((d) => d.ruleId === "optimization/muls-word-power-of-two");
    expect(live?.suggestion?.applicability).toBe("conditional");
  });

  test("propagates constant results through word multiply", async () => {
    const { parseFile } = await import("m68k-parser");
    const { DefaultRuleContext } = await import("../core/context.js");
    const source = ["moveq #7,d0", "muls.w #8,d0", "rts"].join("\n");
    const ctx = new DefaultRuleContext(parseFile(source), source, { processors: ["mc68000"] });
    expect(ctx.registers.valueAfter(1, "d0")).toEqual({ kind: "constant", value: 56 });
  });
});

describe("v0.13 multiply and disposable-register sequence rules", () => {
  test("offers unsigned word power-of-two multiply replacement and checks CCR liveness", () => {
    const safeSource = ["mulu.w #8,d0", "move.l d1,d2", "rts"].join("\n");
    const safe = lintSource(safeSource).find((d) => d.ruleId === "optimization/mulu-word-power-of-two");
    expect(safe?.suggestion?.replacement).toBe("swap d0\nclr.w d0\nswap d0\nlsl.l #3,d0");
    expect(safe?.suggestion?.applicability).toBe("safe");

    const liveSource = ["mulu.w #8,d0", "bcs .carry", ".carry:", "rts"].join("\n");
    const live = lintSource(liveSource).find((d) => d.ruleId === "optimization/mulu-word-power-of-two");
    expect(live?.suggestion?.applicability).toBe("conditional");
  });

  test("uses the high-power signed word construction for m=9..15", () => {
    const diagnostic = lintSource(["muls.w #1024,d3", "move.l d0,d1", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/muls-word-high-power-of-two");
    expect(diagnostic?.suggestion?.replacement).toBe("swap d3\nclr.w d3\nasr.l #6,d3");
  });

  test("collapses NEG+SUB only when the negated register is disposable", () => {
    const source = [
      "neg.l d0",
      "sub.l d0,d1",
      "move.l #0,d0",
      "move.l d2,d3",
      "rts",
    ].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/negate-sub-to-add");
    expect(diagnostic?.suggestion?.replacement).toBe("add.l d0,d1");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("does not collapse NEG pair if the changed source value is later read", () => {
    const source = ["neg.l d0", "sub.l d0,d1", "move.l d0,d2", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/negate-sub-to-add");
  });

  test("collapses NEG+ADD to SUB for a dead source register", () => {
    const source = ["neg.w d4", "add.w d4,d5", "moveq #0,d4", "move.l d0,d1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/negate-add-to-sub");
    expect(diagnostic?.suggestion?.replacement).toBe("sub.w d4,d5");
  });
});

test("v0.13 uses the high-power unsigned word construction", () => {
  const diagnostic = lintSource(["mulu.w #2048,d6", "move.l d0,d1", "rts"].join("\n"))
    .find((d) => d.ruleId === "optimization/mulu-word-high-power-of-two");
  expect(diagnostic?.suggestion?.replacement).toBe("swap d6\nclr.w d6\nlsr.l #5,d6");
});

describe("v0.16 redundant TST and additional ASP68K rules", () => {
  test("removes TST after MOVE when the same register/result size already set equivalent flags", () => {
    const source = ["move.w d0,d1", "tst.w d1", "beq .foo", ".foo:", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/redundant-tst");
    expect(diagnostic?.suggestion?.replacement).toBe("");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("does not remove TST after arithmetic when carry is consumed", () => {
    const source = ["add.w d0,d1", "tst.w d1", "bcs .carry", ".carry:", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/redundant-tst");
  });

  test("does remove TST after arithmetic when only Z is observed", () => {
    const source = ["add.w d0,d1", "tst.w d1", "beq .zero", ".zero:", "rts"].join("\n");
    expect(ids(source)).toContain("optimization/redundant-tst");
  });

  test("does not remove a labelled TST that may be an alternate entry point", () => {
    const source = ["move.w d0,d1", ".test:", "tst.w d1", "beq .zero", ".zero:", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/redundant-tst");
  });

  test("uses TAS for BSET bit 7 plus BEQ on 68000", () => {
    const source = ["bset.b #7,(a0)", "beq .clear", "move.l d0,d1", ".clear:", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/bset-to-tas");
    expect(diagnostic?.suggestion?.replacement).toBe("tas (a0)\nbpl .clear");
  });

  test("does not suggest memory TAS form on 68040", () => {
    expect(lintSource("bset.b #7,(a0)", { processors: ["mc68040"] }).map((d) => d.ruleId))
      .not.toContain("optimization/bset-to-tas");
  });

  test("uses SUBA.L to zero an address register for LEA 0.w", () => {
    const diagnostic = lintSource("lea 0.w,a2").find((d) => d.ruleId === "optimization/lea-zero-address");
    expect(diagnostic?.suggestion?.replacement).toBe("suba.l a2,a2");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("synthesizes selected constants with MOVEQ + NOT.W", () => {
    const diagnostic = lintSource(["move.l #65534,d0", "move.l d1,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/move-immediate-word-complement");
    expect(diagnostic?.suggestion?.replacement).toBe("moveq #1,d0\nnot.w d0");
  });

  test("synthesizes selected constants with MOVEQ + SWAP", () => {
    const diagnostic = lintSource(["move.l #2752512,d0", "move.l d1,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/move-immediate-swap");
    expect(diagnostic?.suggestion?.replacement).toBe("moveq #42,d0\nswap d0");
  });
});

// Mnemonic spelling/alias normalization smoke tests are intentionally kept at
// the helper level: every rule using isInstruction() benefits automatically.
import { isInstruction, isInstructionFamily } from "../util/ast.js";
import { canonicalMnemonicName } from "../semantics/mnemonics.js";

describe("mnemonic canonicalisation", () => {
  test("normalises immediate instruction spellings", () => {
    expect(canonicalMnemonicName("ADDI")).toBe("add");
    expect(canonicalMnemonicName("SUBI")).toBe("sub");
    expect(canonicalMnemonicName("CMPI")).toBe("cmp");
    expect(canonicalMnemonicName("EORI")).toBe("eor");
  });

  test("normalises condition-code aliases", () => {
    expect(canonicalMnemonicName("BHS")).toBe("bcc");
    expect(canonicalMnemonicName("BLO")).toBe("bcs");
    expect(canonicalMnemonicName("DBHS")).toBe("dbcc");
    expect(canonicalMnemonicName("DBLO")).toBe("dbcs");
    expect(canonicalMnemonicName("DBRA")).toBe("dbf");
  });
});

describe("operand-sensitive semantic normalisation", () => {
  test("treats generic ADD to An as ADDA for rules and CCR semantics", () => {
    expect(ids("add.l #100,a0")).toContain("optimization/address-add-to-lea");
    expect(ids("add.l #5,a0")).toContain("optimization/prefer-addq");
  });

  test("treats generic MOVE to An as MOVEA, not flag-setting MOVE", () => {
    expect(ids("move.l #42,a0")).not.toContain("optimization/prefer-moveq");
    expect(ids("move.l #42,a0")).toContain("optimization/prefer-move-word-address");

    const source = ["move.l d0,a0", "beq .foo", ".foo:", "rts"].join("\n");
    expect(ids(source)).toContain("correctness/stale-condition-code");
  });

  test("does not suggest TST for generic CMP to An", () => {
    expect(ids("cmp.l #0,a0")).not.toContain("optimization/prefer-tst-zero");
  });

  test("treats address-register self MOVE as a removable MOVEA", () => {
    const diagnostic = lintSource("move.l a0,a0").find((d) => d.ruleId === "suspicious/self-move");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
    expect(diagnostic?.suggestion?.replacement).toBe("");
  });
});

describe("v0.19 long shifts and MOVEA/LEA rules", () => {
  test("replaces ASL.L #16 with SWAP+CLR.W on 68000", () => {
    const diagnostic = lintSource(["asl.l #16,d0", "move.l d1,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/long-shift-sequence");
    expect(diagnostic?.suggestion?.replacement).toBe("swap d0\nclr.w d0");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("uses the 17..31 arithmetic-right shift sequence", () => {
    const diagnostic = lintSource(["asr.l #20,d3", "move.l d1,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/long-shift-sequence");
    expect(diagnostic?.suggestion?.replacement).toBe("swap d3\nasr.w #4,d3\next.l d3");
  });

  test("does not offer early-CPU ASL sequence on 68040", () => {
    expect(lintSource("asl.l #16,d0", { processors: ["mc68040"] }).map((d) => d.ruleId))
      .not.toContain("optimization/long-shift-sequence");
  });

  test("allows the documented LSR #16 sequence on 68030", () => {
    expect(lintSource("lsr.l #16,d0", { processors: ["mc68030"] }).map((d) => d.ruleId))
      .toContain("optimization/long-shift-sequence");
  });

  test("uses LEA for a non-zero immediate MOVEA on 68000", () => {
    const diagnostic = lintSource("move.l #100,a0").find((d) => d.ruleId === "optimization/movea-immediate-to-lea");
    expect(diagnostic?.suggestion?.replacement).toBe("lea 100.l,a0");
  });

  test("folds MOVEA.L plus immediate ADDA into LEA", () => {
    const source = ["move.l a0,a1", "add.l #12,a1", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/movea-add-to-lea");
    expect(diagnostic?.suggestion?.replacement).toBe("lea 12(a0),a1");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("does not fold a word-sized address-register copy into LEA", () => {
    const source = ["move.w a0,a1", "add.w #12,a1", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/movea-add-to-lea");
  });
});

describe("v0.19 multiple predecrement cancellation", () => {
  test("folds ADDQ #6 plus word/long predecrement stores", () => {
    const source = ["addq.l #6,a0", "move.w d0,-(a0)", "move.l d1,-(a0)", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/cancel-multiple-predecrement-moves");
    expect(diagnostic?.suggestion?.replacement).toBe("move.w d0,4(a0)\nmove.l d1,(a0)");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("folds ADDQ #6 plus long/word predecrement stores", () => {
    const source = ["addq.w #6,a2", "move.l d0,-(a2)", "move.w d1,-(a2)", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/cancel-multiple-predecrement-moves");
    expect(diagnostic?.suggestion?.replacement).toBe("move.l d0,2(a2)\nmove.w d1,(a2)");
  });

  test("rejects a source operand which depends on the adjusted register", () => {
    const source = ["addq.l #8,a0", "move.l (a0),-(a0)", "move.l d1,-(a0)", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/cancel-multiple-predecrement-moves");
  });
});

describe("v0.20 coverage rules", () => {
  test("cancels ADDQ #4,SP plus PEA with CCR-aware direct store", () => {
    const safe = lintSource(["addq.l #4,sp", "pea (a0)", "move.l d0,d1", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/cancel-stack-pea-sequence");
    expect(safe?.suggestion?.replacement).toBe("move.l a0,(sp)");
    expect(safe?.suggestion?.applicability).toBe("safe");

    const escaping = lintSource(["addq.l #4,sp", "pea (a0)", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/cancel-stack-pea-sequence");
    expect(escaping?.suggestion?.applicability).toBe("conditional");
  });

  test("cancels mixed stack predecrement/PEA forms", () => {
    const a = lintSource(["addq.w #6,sp", "move.w d0,-(sp)", "pea (a1)", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/cancel-stack-pea-sequence");
    expect(a?.suggestion?.replacement).toBe("move.w d0,4(sp)\nmove.l a1,(sp)");

    const b = lintSource(["addq.l #8,sp", "pea (a0)", "move.l d2,-(sp)", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/cancel-stack-pea-sequence");
    expect(b?.suggestion?.replacement).toBe("move.l a0,4(sp)\nmove.l d2,(sp)");
    expect(b?.suggestion?.applicability).toBe("safe");
  });

  test("rejects stack-fold source operands that depend on SP", () => {
    expect(ids(["addq.w #6,sp", "move.w (sp),-(sp)", "pea (a1)"].join("\n")))
      .not.toContain("optimization/cancel-stack-pea-sequence");
  });

  test("removes long multiply by one only for 68060 and respects CCR", () => {
    const diagnostic = lintSource(["muls.l #1,d0", "move.l d1,d2", "rts"].join("\n"), { processors: ["mc68060"] })
      .find((d) => d.ruleId === "optimization/multiply-long-by-one");
    expect(diagnostic?.suggestion?.replacement).toBe("");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");

    expect(lintSource("muls.l #1,d0", { processors: ["mc68040"] }).map((d) => d.ruleId))
      .not.toContain("optimization/multiply-long-by-one");
  });
});

describe("v0.22 deferred-rule tranche", () => {
  test("folds MOVEA plus immediate/index ADDA into one LEA", () => {
    const add = lintSource(["move.l a0,a2", "add.l #12,a2", "add.w d3,a2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/address-expression-to-lea");
    expect(add?.suggestion?.replacement).toBe("lea 12(a0,d3.w),a2");
    expect(add?.suggestion?.applicability).toBe("safe");

    const sub = lintSource(["move.l a1,a4", "sub.w #8,a4", "add.l d5,a4", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/address-expression-to-lea");
    expect(sub?.suggestion?.replacement).toBe("lea -8(a1,d5.l),a4");
  });

  test("does not fold MOVEA.W base copies into LEA", () => {
    expect(ids(["move.w a0,a2", "add.w #12,a2", "add.w d3,a2"].join("\n")))
      .not.toContain("optimization/address-expression-to-lea");
  });

  test("suggests DIVU.W power-of-two shifts with remainder review when upper-word use is unknown", () => {
    const diagnostic = lintSource(["divu.w #8,d0", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/divu-word-power-of-two");
    expect(diagnostic?.suggestion?.replacement).toBe("lsr.l #3,d0");
    expect(diagnostic?.suggestion?.applicability).toBe("manual");
    expect(diagnostic?.data?.upperWordUse).toBe("unknown");
  });

  test("can prove DIVU.W shift observation-equivalence when remainder is discarded", () => {
    const diagnostic = lintSource(["moveq #64,d0", "divu.w #8,d0", "move.w d0,d1", "moveq #0,d0", "move.l d2,d3", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/divu-word-power-of-two");
    expect(diagnostic?.suggestion?.replacement).toBe("lsr.l #3,d0");
    expect(diagnostic?.data?.upperWordUse).toBe("unused");
    expect(diagnostic?.data?.quotientOverflowProvenSafe).toBe(true);
  });
});

describe("v0.27 Flamewing shift tranche", () => {
  test("clears known register-count logical shifts once the count reaches the operand width", () => {
    const byte = lintSource(["moveq #9,d1", "lsl.b d1,d0", "move.l d2,d3", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-shift-to-clear");
    expect(byte?.suggestion?.replacement).toBe("clr.b d0");

    const long = lintSource(["moveq #32,d1", "lsr.l d1,d0", "move.l d2,d3", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-shift-to-clear");
    expect(long?.suggestion?.replacement).toBe("moveq #0,d0");
  });

  test("does not treat ASR as a zeroing shift", () => {
    expect(ids(["moveq #32,d1", "asr.l d1,d0"].join("\n")))
      .not.toContain("optimization/known-register-shift-to-clear");
  });

  test("recognises Flamewing byte edge-shift identities", () => {
    const lsr = lintSource(["lsr.b #7,d0", "move.l d1,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/lsr-byte-seven");
    expect(lsr?.suggestion?.replacement).toBe("add.b d0,d0\nsubx.b d0,d0\nneg.b d0");

    const asr = lintSource(["asr.b #8,d0", "move.l d1,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/asr-byte-saturate");
    expect(asr?.suggestion?.replacement).toBe("add.b d0,d0\nsubx.b d0,d0");
  });
});

describe("v0.29 Flamewing multiply tranche", () => {
  test("uses verified full-result MULS.W recipes with a dead scratch register", () => {
    const diagnostic = lintSource(["muls.w #11,d0", "move.l d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/muls-word-full-result-constants");
    expect(diagnostic?.suggestion?.replacement).toContain("ext.l d0");
    expect(diagnostic?.suggestion?.replacement).toContain("asl.l #2,d0");
    expect(diagnostic?.data?.factor).toBe(11);
  });

  test("supports additional full-result factors from Flamewing", () => {
    for (const factor of [13, 14, 15, 17, 19, 23, 26, 29, 31, 35]) {
      const diagnostic = lintSource([`muls.w #${factor},d0`, "move.l d0,d2", "rts"].join("\n"))
        .find((d) => d.ruleId === "optimization/muls-word-full-result-constants");
      expect(diagnostic?.data?.factor).toBe(factor);
    }
  });

  test("uses low-word-only recipes only when the result high word is discarded", () => {
    const safe = lintSource(["muls.w #7,d0", "move.w d0,d2", "moveq #0,d0", "move.l d3,d4", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/muls-word-low-word-only");
    expect(safe?.data?.upperWordUse).toBe("unused");

    const used = lintSource(["muls.w #7,d0", "swap d0", "move.w d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/muls-word-low-word-only");
    expect(used).toBeUndefined();
  });
});

  test("reduces known large register-count ASR to sign saturation", () => {
    const word = lintSource(["moveq #15,d1", "asr.w d1,d0", "move.l d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-asr-saturate");
    expect(word?.suggestion?.replacement).toBe("add.w d0,d0\nsubx.w d0,d0");

    const long = lintSource(["moveq #31,d1", "asr.l d1,d0", "move.l d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-asr-saturate");
    expect(long?.suggestion?.replacement).toBe("add.l d0,d0\nsubx.l d0,d0");
  });


describe("v0.30 Flamewing partial-register tranche", () => {
  test("uses MOVEQ + AND.B when upper 24 bits are proven discarded", () => {
    const source = ["move.b (a0),d0", "andi.b #$7f,d0", "move.b d0,d1", "moveq #0,d0", "rts"].join("\n");
    const diagnostic = lintSource(source).find((d) => d.ruleId === "optimization/move-byte-and-mask");
    expect(diagnostic?.suggestion?.replacement).toBe("moveq #127,d0\nand.b (a0),d0");
    expect(diagnostic?.suggestion?.applicability).toBe("safe");
  });

  test("does not use MOVEQ + AND.B when upper bits are subsequently observed", () => {
    const source = ["move.b (a0),d0", "andi.b #$7f,d0", "move.l d0,d1", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/move-byte-and-mask");
  });

  test("does not reorder an EA which depends on the destination data register", () => {
    const source = ["move.b (a0,d0.w),d0", "andi.b #$7f,d0", "move.b d0,d1", "moveq #0,d0", "rts"].join("\n");
    expect(ids(source)).not.toContain("optimization/move-byte-and-mask");
  });

  test("reduces high known register-count long logical shifts without stack scratch", () => {
    const left = lintSource(["moveq #30,d1", "lsl.l d1,d0", "move.l d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-shift-reduction");
    expect(left?.suggestion?.replacement).toBe("ror.w #2,d0\nandi.w #$C000,d0\nswap d0\nclr.w d0");

    const right = lintSource(["moveq #29,d1", "lsr.l d1,d0", "move.l d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-shift-reduction");
    expect(right?.suggestion?.replacement).toBe("clr.w d0\nswap d0\nandi.w #$E000,d0\nrol.w #3,d0");
  });
});

describe("v0.31 Flamewing arithmetic-shift tranche", () => {
  test("uses ASR.W low-word reduction only when the high word is discarded", () => {
    const safe = lintSource(["moveq #12,d1", "asr.w d1,d0", "move.w d0,d2", "moveq #0,d0", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-asr-word-low-only");
    expect(safe?.suggestion?.replacement).toBe("ext.l d0\nswap d0\nrol.l #4,d0");

    const used = lintSource(["moveq #12,d1", "asr.w d1,d0", "move.l d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-asr-word-low-only");
    expect(used).toBeUndefined();
  });

  test("reduces known ASR.L counts 26..30 without stack scratch", () => {
    const diagnostic = lintSource(["moveq #28,d1", "asr.l d1,d0", "move.l d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/known-register-asr-long-high");
    expect(diagnostic?.suggestion?.replacement).toBe("swap d0\next.l d0\nswap d0\nrol.l #4,d0\next.l d0");
  });
});

describe("v0.32 Flamewing unsigned low-word multiply tranche", () => {
  test("uses a word-only MULU recipe when the high word is discarded", () => {
    const diagnostic = lintSource(["mulu.w #9,d0", "move.w d0,d2", "moveq #0,d0", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/mulu-word-low-word-only");
    expect(diagnostic?.suggestion?.replacement).toContain("lsl.w #3,d0");
    expect(diagnostic?.data?.factor).toBe(9);
  });

  test("does not use a word-only MULU recipe when the high word is observed", () => {
    const diagnostic = lintSource(["mulu.w #9,d0", "move.l d0,d2", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/mulu-word-low-word-only");
    expect(diagnostic).toBeUndefined();
  });

  test("can remove MULU.W #1 when only the low word and no CCR result are observed", () => {
    const diagnostic = lintSource(["mulu.w #1,d0", "move.w d0,d2", "moveq #0,d0", "move.l d3,d4", "rts"].join("\n"))
      .find((d) => d.ruleId === "optimization/mulu-word-low-word-only");
    expect(diagnostic?.suggestion?.replacement).toBe("");
  });
});

describe("vasm-derived optimizations", () => {
  test("replaces logical identity immediates on data registers with TST", () => {
    const result = lintSource("andi.w #$ffff,d0\nori.l #0,d1\neori.b #0,d2\n", { processors: ["mc68000"] });
    expect(result.diagnostics.some((d) => d.ruleId === "optimization/andi-all-ones-to-tst" && d.suggestion?.replacement === "tst.w d0")).toBe(true);
    expect(result.diagnostics.some((d) => d.ruleId === "optimization/ori-zero-to-tst" && d.suggestion?.replacement === "tst.l d1")).toBe(true);
    expect(result.diagnostics.some((d) => d.ruleId === "optimization/eori-zero-to-tst" && d.suggestion?.replacement === "tst.b d2")).toBe(true);
  });

  test("marks memory logical-identity replacement manual because RMW side effects differ", () => {
    const result = lintSource("ori.w #0,(a0)\n", { processors: ["mc68000"] });
    const diagnostic = result.diagnostics.find((d) => d.ruleId === "optimization/ori-zero-to-tst");
    expect(diagnostic?.suggestion?.applicability).toBe("manual");
  });

  test("narrows signed-word CMPA immediates", () => {
    const result = lintSource("cmp.l #1234,a0\n", { processors: ["mc68000"] });
    expect(result.diagnostics.some((d) => d.ruleId === "optimization/narrow-cmpa-immediate-word" && d.suggestion?.replacement === "cmpa.w #1234,a0")).toBe(true);
  });
});

describe("Flamewing A7 stack-alignment shift by eight", () => {
  test("suggests LSL.W #8 on 68000 as a bounded stack-scratch optimization", () => {
    const result = lintSource("lsl.w #8,d0\n", { processors: ["mc68000"] });
    const d = result.diagnostics.find((x) => x.ruleId === "optimization/stack-word-shift-eight");
    expect(d).toBeDefined();
    expect(d?.suggestion?.applicability).toBe("conditional");
    expect(d?.suggestion?.replacement).toContain("move.b d0,-(sp)");
    expect(d?.suggestion?.replacement).toContain("move.w (sp)+,d0");
    expect(d?.suggestion?.replacement).toContain("clr.b d0");
  });

  test("suggests LSR.W #8 on 68000 as a manual stack-scratch optimization", () => {
    const result = lintSource("lsr.w #8,d2\n", { processors: ["mc68000"] });
    const d = result.diagnostics.find((x) => x.ruleId === "optimization/stack-word-shift-eight");
    expect(d).toBeDefined();
    expect(d?.suggestion?.replacement).toContain("move.w d2,-(sp)");
    expect(d?.suggestion?.replacement).toContain("move.b (sp)+,d2");
  });

  test("does not offer the 68000 stack trick on later-only targets", () => {
    const result = lintSource("lsl.w #8,d0\n", { processors: ["mc68020"] });
    expect(result.diagnostics.some((x) => x.ruleId === "optimization/stack-word-shift-eight")).toBe(false);
  });
});

describe("Flamewing bounded A7 stack-scratch shifts", () => {
  test("suggests ASR.W #8 using two temporary stack bytes", () => {
    const result = lintSource("asr.w #8,d0\n", { processors: ["mc68000"] });
    const d = result.diagnostics.find((x) => x.ruleId === "optimization/stack-word-shift-eight");
    expect(d).toBeDefined();
    expect(d?.suggestion?.replacement).toBe("move.w d0,-(sp)\nmove.b (sp)+,d0\next.w d0");
    expect(d?.suggestion?.applicability).toBe("conditional");
  });

  test("replaces MOVEQ #9 + LSL.W with the bounded stack form when the count register is disposable", () => {
    const result = lintSource("moveq #9,d1\nlsl.w d1,d0\nmove.w d0,d2\n", { processors: ["mc68000"] });
    const d = result.diagnostics.find((x) => x.ruleId === "optimization/stack-known-register-shift");
    expect(d).toBeDefined();
    expect(d?.suggestion?.replacement).toContain("move.b d0,-(sp)");
    expect(d?.suggestion?.replacement).toContain("add.w d0,d0");
  });

  test("suggests the stack-assisted LSL.L #24 known-count sequence", () => {
    const result = lintSource("moveq #24,d1\nlsl.l d1,d0\nmove.l d0,d2\n", { processors: ["mc68000"] });
    const d = result.diagnostics.find((x) => x.ruleId === "optimization/stack-known-register-shift");
    expect(d).toBeDefined();
    expect(d?.suggestion?.replacement).toContain("swap d0");
    expect(d?.suggestion?.replacement).toContain("clr.w d0");
  });

  test("suggests the stack-assisted LSR.L #24 known-count sequence", () => {
    const result = lintSource("moveq #24,d1\nlsr.l d1,d0\nmove.l d0,d2\n", { processors: ["mc68000"] });
    const d = result.diagnostics.find((x) => x.ruleId === "optimization/stack-known-register-shift");
    expect(d).toBeDefined();
    expect(d?.suggestion?.replacement).toContain("move.w d0,-(sp)");
    expect(d?.suggestion?.replacement).toContain("move.b (sp)+,d0");
  });

  test("does not remove a live count register setup", () => {
    const result = lintSource("moveq #24,d1\nlsl.l d1,d0\nmove.l d1,d2\n", { processors: ["mc68000"] });
    expect(result.diagnostics.some((x) => x.ruleId === "optimization/stack-known-register-shift")).toBe(false);
  });
});

describe("v0.37 vasm source + optimization goals", () => {
  test("replaces negative power-of-two long MULS using shift plus NEG", () => {
    const diagnostic = lintSource("muls.l #-8,d0\nmove.l d0,d1\n", { processors: ["mc68020"] })
      .find((d) => d.ruleId === "optimization/negative-signed-multiply");
    expect(diagnostic?.suggestion?.replacement).toBe("asl.l #3,d0\nneg.l d0");
  });

  test("replaces MULS.W #-1 with EXT.L plus NEG.L", () => {
    const diagnostic = lintSource("muls.w #-1,d0\nmove.l d0,d1\n", { processors: ["mc68000"] })
      .find((d) => d.ruleId === "optimization/negative-signed-multiply");
    expect(diagnostic?.suggestion?.replacement).toBe("ext.l d0\nneg.l d0");
  });

  test("size goal suppresses speed-for-size rules but balanced retains them", () => {
    const source = "muls.l #-8,d0\nmove.l d0,d1\n";
    expect(lintSource(source, { processors: ["mc68020"], goal: "balanced" })
      .some((d) => d.ruleId === "optimization/negative-signed-multiply")).toBe(true);
    expect(lintSource(source, { processors: ["mc68020"], goal: "size" })
      .some((d) => d.ruleId === "optimization/negative-signed-multiply")).toBe(false);
  });
});

describe("platform modes", () => {
  test("TAS optimization is disabled by default", () => {
    const source = ["bset.b #7,(a0)", "moveq #0,d7"].join("\n");
    expect(lintSource(source).map((d) => d.ruleId)).not.toContain("optimization/bset-to-tas");
  });

  test("TAS optimization can still be explicitly enabled", () => {
    const source = ["bset.b #7,(a0)", "moveq #0,d7"].join("\n");
    const result = lintSource(source, {
      processors: ["mc68000"],
      platform: "generic",
      goal: "balanced",
      measureImpact: false,
      rules: { "optimization/bset-to-tas": "suggestion" },
    });
    expect(result.map((d) => d.ruleId)).toContain("optimization/bset-to-tas");
  });

  test("Amiga mode rejects TAS instructions", () => {
    expect(lintSource("tas (a0)", {
      processors: ["mc68000"], platform: "amiga", goal: "balanced", measureImpact: false,
    }).map((d) => d.ruleId)).toContain("correctness/amiga-tas-unsupported");

    expect(lintSource("tas (a0)", {
      processors: ["mc68000"], platform: "generic", goal: "balanced", measureImpact: false,
    }).map((d) => d.ruleId)).not.toContain("correctness/amiga-tas-unsupported");
  });

  test("Amiga mode checks custom-register access direction", () => {
    const config = { processors: ["mc68000"], platform: "amiga", goal: "balanced", measureImpact: false } as import("../core/config.js").LintConfig;
    expect(lintSource("move.w #1,$dff002", config).map((d) => d.ruleId)).toContain("correctness/amiga-custom-register-access");
    expect(lintSource("move.w $dff09a,d0", config).map((d) => d.ruleId)).toContain("correctness/amiga-custom-register-access");
    expect(lintSource("move.w $dff002,d0", config).map((d) => d.ruleId)).not.toContain("correctness/amiga-custom-register-access");
    expect(lintSource("move.w d0,$dff09a", config).map((d) => d.ruleId)).not.toContain("correctness/amiga-custom-register-access");

    // Canonical Amiga include style: register symbols are offsets from CUSTOM.
    expect(lintSource("    lea CUSTOM,a6\n    move.w DMACON(a6),d0\n", config).map((d) => d.ruleId)).toContain("correctness/amiga-custom-register-access");
    expect(lintSource("    lea custom,a6\n    move.w d0,dmaconr(a6)\n", config).map((d) => d.ruleId)).toContain("correctness/amiga-custom-register-access");

    // Absolute expressions combining a register offset with the CUSTOM base.
    expect(lintSource("    move.w DMACON+CUSTOM,d0\n", config).map((d) => d.ruleId)).toContain("correctness/amiga-custom-register-access");
    expect(lintSource("    move.w d0,DMACONR+CUSTOM\n", config).map((d) => d.ruleId)).toContain("correctness/amiga-custom-register-access");
    expect(lintSource("    move.w DMACONR+CUSTOM,d0\n", config).map((d) => d.ruleId)).not.toContain("correctness/amiga-custom-register-access");
  });
});

describe("Amiga suspicious absolute-address footguns", () => {
  const amiga = {
    processors: ["mc68000"], platform: "amiga", goal: "balanced", measureImpact: false,
  } as import("../core/config.js").LintConfig;

  test("flags an unusual numeric absolute source that may be a missing immediate prefix", () => {
    const result = lintSource("move.w $1234,d0\n", amiga);
    const d = result.find((x) => x.ruleId === "suspicious/unexpected-absolute-address");
    expect(d).toBeDefined();
    expect(d?.message).toContain("#$1234");
  });

  test("allows the configured zero-page vector range", () => {
    expect(lintSource("move.l $bc,d0\n", amiga)
      .some((x) => x.ruleId === "suspicious/unexpected-absolute-address")).toBe(false);
  });

  test("allows the configured custom-register range", () => {
    expect(lintSource("move.w $dff002,d0\n", amiga)
      .some((x) => x.ruleId === "suspicious/unexpected-absolute-address")).toBe(false);
  });

  test("allows the configured CIA register range", () => {
    expect(lintSource("move.b $bfe001,d0\n", amiga)
      .some((x) => x.ruleId === "suspicious/unexpected-absolute-address")).toBe(false);
  });

  test("suppresses the heuristic for files containing ORG", () => {
    expect(lintSource("    org $1000\n    move.w $1234,d0\n", amiga)
      .some((x) => x.ruleId === "suspicious/unexpected-absolute-address")).toBe(false);
  });

  test("does not guess about ordinary symbolic addresses", () => {
    expect(lintSource("move.w foo,d0\nfoo: dc.w 1\n", amiga)
      .some((x) => x.ruleId === "suspicious/unexpected-absolute-address")).toBe(false);
  });

  test("does not flag absolute destinations because they cannot be a missing immediate", () => {
    expect(lintSource("move.w d0,$1234\n", amiga)
      .some((x) => x.ruleId === "suspicious/unexpected-absolute-address")).toBe(false);
  });

  test("does not run in generic platform mode", () => {
    expect(lintSource("move.w $1234,d0\n", {
      processors: ["mc68000"], platform: "generic", goal: "balanced", measureImpact: false,
    }).some((x) => x.ruleId === "suspicious/unexpected-absolute-address")).toBe(false);
  });
});
