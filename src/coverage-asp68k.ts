export type Asp68kCoverageStatus = "implemented" | "partial" | "deferred" | "rejected" | "skipped";

export interface Asp68kCoverageEntry {
  rule?: string;
  sourceLines: readonly number[];
  status: Asp68kCoverageStatus;
  note?: string;
}

/**
 * Machine-readable coverage notes for the historical ASP68K optimisation table.
 * `sourceLines` are the line numbers of transformation rows in 68Koptims.txt,
 * not source-code line numbers in the file being linted.
 *
 * This is intentionally incremental: unlisted rows are currently untracked,
 * while ASP68K_TOTAL_TRANSFORM_ROWS records the table size found by the v0.8 audit.
 *
 * The v0.8 audit reported 181 rows, but tracking has since accumulated 182
 * distinct row numbers, so that count was low by at least one and the summary
 * was reporting more rows tracked than the table was said to contain.
 */
export const ASP68K_TOTAL_TRANSFORM_ROWS = 182;

export const asp68kCoverage: readonly Asp68kCoverageEntry[] = [
  {
    rule: "optimization/zero-arithmetic-to-tst",
    sourceLines: [168, 1146],
    status: "implemented",
    note: "X differs because TST preserves it; applicability is decided with X liveness.",
  },
  { rule: "optimization/prefer-bclr", sourceLines: [259], status: "implemented" },
  { rule: "optimization/prefer-bset", sourceLines: [1142], status: "implemented" },
  {
    rule: "optimization/combine-adjacent-clr-bytes",
    sourceLines: [414],
    status: "implemented",
    note: "Manual due to possible memory-mapped I/O access-width differences.",
  },
  {
    rule: "optimization/combine-adjacent-clr-words",
    sourceLines: [421],
    status: "implemented",
    note: "Manual due to possible memory-mapped I/O access-width differences.",
  },
  { rule: "optimization/combine-ext-byte", sourceLines: [476], status: "implemented", note: "68040/68060 only." },
  {
    rule: "optimization/combine-adjacent-move-bytes",
    sourceLines: [593],
    status: "implemented",
    note: "Manual due to possible memory-mapped I/O access-width differences.",
  },
  {
    rule: "optimization/combine-adjacent-move-words",
    sourceLines: [883],
    status: "implemented",
    note: "Manual due to possible memory-mapped I/O access-width differences.",
  },
  {
    rule: "suspicious/nop",
    sourceLines: [1138],
    status: "partial",
    note: "Detected as an opt-in advisory because NOP can be intentional for timing/patch/alignment purposes.",
  },
  { rule: "optimization/redundant-zero-displacement", sourceLines: [166], status: "implemented" },
  { rule: "optimization/prefer-addq", sourceLines: [170], status: "implemented" },
  { rule: "optimization/prefer-subq-negative-add", sourceLines: [174], status: "implemented" },
  { rule: "optimization/address-add-to-lea", sourceLines: [178], status: "implemented" },
  {
    sourceLines: [182],
    status: "rejected",
    note: "ADDQ.W #n,An and ADDQ.L #n,An both take 8(1/0) on 68000. The 4-cycle figure in M68000UM is a documented error: the same microwords drive both, real-hardware measurement confirms 8, and exact auditing here measures no difference. There is no size difference either, so the transform does nothing.",
  },
  {
    rule: "optimization/combine-consecutive-addq",
    sourceLines: [184],
    status: "partial",
    note: "If the combined value remains 1..8, emits one ADDQ. ASP68K's sum>8 ADD.L form is suppressed on mc68000 because exact audit measured +2 bytes, +1 read cycle, and no CPU-cycle gain; retained only as source-backed behavior for mc68010/mc68030. Data-register form is CCR-sensitive; address-register form preserves CCR.",
  },
  {
    rule: "optimization/cancel-addq-predecrement-move",
    sourceLines: [187, 192],
    status: "implemented",
    note: "Requires the MOVE source not to read the adjusted address register.",
  },
  {
    rule: "optimization/cancel-multiple-predecrement-moves",
    sourceLines: [197, 204, 211],
    status: "implemented",
    note: "Covers the 6-byte word+long/long+word and 8-byte long+long forms; both MOVE sources must be independent of the adjusted address register.",
  },
  {
    rule: "optimization/cancel-stack-pea-sequence",
    sourceLines: [218, 224, 231, 238, 245, 252],
    status: "implemented",
    note: "Covers ADDQ-to-SP followed by PEA/predecrement combinations; SP-dependent source EAs are rejected and CCR differences from replacing PEA with MOVE are checked.",
  },
  { rule: "optimization/prefer-add-for-shift-one", sourceLines: [292, 540], status: "implemented" },
  { rule: "optimization/shift-two-adds", sourceLines: [263, 285, 511, 533], status: "implemented" },
  {
    rule: "optimization/shift-to-clear",
    sourceLines: [266, 281, 288, 514, 529, 536, 542, 557, 561],
    status: "implemented",
    note: "Logical/left-shift-to-zero forms only; arithmetic-right-shift clear rows are rejected as value-incorrect for negative operands.",
  },
  {
    sourceLines: [294, 303, 313],
    status: "rejected",
    note: "ASP68K suggests CLR/MOVEQ #0 for ASR counts >= operand width, but negative operands arithmetic-shift to all ones rather than zero.",
  },
  {
    rule: "optimization/long-shift-sequence",
    sourceLines: [270, 275, 298, 307, 518, 523, 546, 551],
    status: "implemented",
    note: "16..31-bit long-shift sequence forms; gated to CPUs where ASP68K records a win and CCR differences are checked.",
  },
  {
    sourceLines: [317],
    status: "skipped",
    note: "Short-branch selection needs final layout and is already handled by vasm; intentionally out of scope for source-only linting.",
  },
  { rule: "optimization/bclr-low-word-mask", sourceLines: [321], status: "implemented" },
  {
    rule: "optimization/bset-to-tas",
    sourceLines: [331, 337, 343, 348, 353, 358],
    status: "implemented",
    note: "Memory form is limited to 68000/68010; data-register form to 68000/68010/68030. CCR differences are checked.",
  },
  { rule: "optimization/null-branch", sourceLines: [326], status: "implemented" },
  {
    rule: "optimization/btst-sign-branch",
    sourceLines: [372, 378, 384, 389, 394, 399, 404, 409],
    status: "implemented",
  },
  { rule: "optimization/prefer-moveq-zero", sourceLines: [419], status: "implemented" },
  {
    rule: "optimization/known-zero-clear",
    sourceLines: [426, 430],
    status: "implemented",
    note: "Requires a data register proven zero; emitted as conditional for possible memory-mapped I/O bus-cycle differences.",
  },
  {
    rule: "optimization/cmp-zero-address-via-scratch",
    sourceLines: [434],
    status: "partial",
    note: "Implemented conservatively for early-target CMP.L/CMPA.L only; ASP68K also lists .W, which is not treated as flag-equivalent.",
  },
  {
    rule: "optimization/cmpa-zero-to-tst-030",
    sourceLines: [438],
    status: "partial",
    note: "Implemented for the flag-equivalent .L form on 68030; .W intentionally rejected from this rule.",
  },
  {
    rule: "optimization/prefer-tst-zero",
    sourceLines: [442, 444],
    status: "implemented",
    note: "Address-register CMP #0 is handled separately for the safe long form.",
  },
  {
    rule: "optimization/divu-long-power-of-two",
    sourceLines: [448, 456],
    status: "implemented",
    note: "Covers 2^1..2^31 on 68020+; counts above 8 require a proven-dead scratch register. CCR differences are checked.",
  },
  {
    sourceLines: [452],
    status: "rejected",
    note: "ASP68K documents m>=32, but a 32-bit immediate divisor cannot represent 2^32; larger powers are not representable either.",
  },
  {
    rule: "optimization/divu-word-power-of-two",
    sourceLines: [461, 469],
    status: "partial",
    note: "Covers valid DIVU.W power-of-two divisors 2^1..2^15. Safe only when whole-register equivalence and CCR deadness can be proven; otherwise emitted as a manual remainder/overflow review.",
  },
  {
    sourceLines: [465],
    status: "rejected",
    note: "DIVU.W has a 16-bit divisor; the documented 2^m with m>=32 cannot be represented as a word divisor and would truncate rather than mean the stated value.",
  },
  {
    rule: "optimization/multiply-word-by-zero",
    sourceLines: [980, 1055],
    status: "implemented",
    note: "Covers signed and unsigned word multiply by zero.",
  },
  { rule: "optimization/muls-word-by-one", sourceLines: [982], status: "implemented" },
  {
    rule: "optimization/muls-word-selected-constants",
    sourceLines: [984, 997, 1003, 1006, 1011, 1016, 1022, 1027],
    status: "implemented",
    note: "Selected constant recipes require a proven-dead scratch register except ×2; X/V/C differences are checked.",
  },
  {
    sourceLines: [990],
    status: "rejected",
    note: "ASP68K's listed MULS.W #11 sequence evaluates to 19×x (EXT; copy x; double to 2x; add into scratch to 3x; shift 2x by 3 to 16x; add 3x), not 11×x.",
  },
  {
    rule: "optimization/muls-word-power-of-two",
    sourceLines: [1032],
    status: "implemented",
    note: "Covers factors 2^m for 1 <= m <= 8; X/V/C differences are checked with liveness.",
  },
  {
    rule: "optimization/muls-word-high-power-of-two",
    sourceLines: [1043],
    status: "implemented",
    note: "Covers 2^m for m=9..15; m=8 remains handled by the simpler EXT+ASL rule.",
  },
  {
    rule: "optimization/mulu-word-by-one",
    sourceLines: [1057],
    status: "implemented",
    note: "Speed/size trade-off; only emitted on CPUs where ASP68K does not mark it as a regression.",
  },
  {
    rule: "optimization/mulu-word-power-of-two",
    sourceLines: [1110],
    status: "implemented",
    note: "Covers 2^m for 1 <= m <= 8; X/V/C differences are checked with liveness.",
  },
  {
    rule: "optimization/mulu-word-high-power-of-two",
    sourceLines: [1117],
    status: "implemented",
    note: "Covers 2^m for m=9..15; m=8 remains handled by the lower-power rule.",
  },
  {
    rule: "optimization/negate-sub-to-add",
    sourceLines: [1123],
    status: "implemented",
    note: "Requires the negated source register to be proven dead after the pair; CCR use is checked conservatively.",
  },
  {
    rule: "optimization/negate-add-power-of-two-to-eor",
    sourceLines: [1128],
    status: "implemented",
    note: "Requires n power-of-two and a proven incoming dx value with 0<=dx<n; CCR use is checked.",
  },
  {
    rule: "optimization/negate-add-to-sub",
    sourceLines: [1133],
    status: "implemented",
    note: "Requires the negated source register to be proven dead after the pair; CCR use is checked conservatively.",
  },
  {
    rule: "optimization/multiply-long-by-one",
    sourceLines: [932],
    status: "implemented",
    note: "68060 only; deleting MUL is CCR-sensitive.",
  },
  {
    rule: "optimization/multiply-long-small-constant",
    sourceLines: [936, 941, 946, 948, 952, 956, 961, 965],
    status: "implemented",
    note: "Selected constant recipes; scratch-register forms require a proven-dead data register and CCR differences are checked.",
  },
  {
    rule: "optimization/multiply-long-large-power-of-two",
    sourceLines: [969],
    status: "implemented",
    note: "Requires a proven-dead data register for the register shift count; 8 < m < 14.",
  },
  {
    rule: "optimization/muls-long-060-simple",
    sourceLines: [974, 976],
    status: "implemented",
    note: "68060-only zero and small power-of-two signed long multiply forms.",
  },
  {
    sourceLines: [1037, 1049, 1051, 1061, 1069, 1074, 1081, 1088, 1096, 1103],
    status: "deferred",
    note: "Remaining MUL forms need scratch-register selection or more detailed CPU cost modelling.",
  },
  { rule: "optimization/prefer-not", sourceLines: [474], status: "implemented" },
  {
    sourceLines: [479],
    status: "skipped",
    note: "JMP → BRA needs final layout and is already handled by vasm; intentionally out of scope for source-only linting.",
  },
  { rule: "optimization/jsr-rts-tail-call", sourceLines: [483], status: "implemented" },
  {
    sourceLines: [493],
    status: "skipped",
    note: "JSR → BSR needs final layout/same-section information and is already handled by vasm; intentionally out of scope for source-only linting.",
  },
  { rule: "optimization/redundant-lea", sourceLines: [497], status: "implemented" },
  {
    rule: "optimization/lea-zero-address",
    sourceLines: [501],
    status: "implemented",
    note: "Uses explicit SUBA.L spelling for the CCR-preserving address-register form.",
  },
  { rule: "optimization/prefer-lea-quick", sourceLines: [503, 507], status: "implemented" },
  { rule: "optimization/prefer-st-minus-one", sourceLines: [565, 569, 573, 577, 581, 585, 589], status: "implemented" },
  { rule: "optimization/push-immediate-pea", sourceLines: [598], status: "implemented" },
  {
    rule: "optimization/push-address-pea",
    sourceLines: [874, 877],
    status: "implemented",
    note: "Address-register push plus immediate stack adjustment folded to PEA; CCR arithmetic differences are checked.",
  },
  { rule: "optimization/prefer-move-word-address", sourceLines: [602], status: "implemented" },
  { rule: "optimization/prefer-moveq", sourceLines: [628], status: "implemented" },
  {
    rule: "optimization/move-immediate-below-moveq",
    sourceLines: [606],
    status: "implemented",
    note: "CCR differences are checked with liveness.",
  },
  {
    rule: "optimization/move-immediate-byte-complement",
    sourceLines: [611],
    status: "implemented",
    note: "Requires all differing N/Z/V/C outputs to be dead before marking safe.",
  },
  {
    rule: "optimization/move-immediate-word-complement",
    sourceLines: [616],
    status: "implemented",
    note: "Candidate MOVEQ seed is derived by evaluating the sequence exactly.",
  },
  {
    rule: "optimization/move-immediate-swap",
    sourceLines: [622],
    status: "implemented",
    note: "Candidate MOVEQ seed is derived by evaluating the sequence exactly.",
  },
  {
    rule: "optimization/move-immediate-double-byte",
    sourceLines: [637],
    status: "implemented",
    note: "Covers the documented even immediate ranges; X/V/C differences are checked.",
  },
  {
    rule: "optimization/move-immediate-via-scratch",
    sourceLines: [842],
    status: "implemented",
    note: "Requires a data register proven dead after the store and not used by the destination effective address.",
  },
  { rule: "optimization/single-register-movem", sourceLines: [915, 920], status: "implemented" },
  {
    sourceLines: [911],
    status: "deferred",
    note: "MOVEM postincrement expansion is a sequence/cost problem rather than a single-register peephole.",
  },
  { rule: "optimization/prefer-link-sequence", sourceLines: [868], status: "implemented" },
  { rule: "optimization/prefer-unlk-sequence", sourceLines: [880], status: "implemented" },
  { rule: "optimization/zero-address-register", sourceLines: [888], status: "implemented" },
  {
    rule: "optimization/movea-immediate-to-lea",
    sourceLines: [890],
    status: "implemented",
    note: "68000/68010 only; generic MOVE-to-An spelling is normalized to MOVEA semantics.",
  },
  {
    rule: "optimization/movea-add-to-lea",
    sourceLines: [894],
    status: "partial",
    note: "Implemented for a full-width MOVEA.L base copy followed by signed-16-bit immediate ADDA; .W copy intentionally excluded.",
  },
  { rule: "optimization/bset-low-word-mask", sourceLines: [362], status: "implemented" },
  { rule: "optimization/bsr-rts-tail-call", sourceLines: [367], status: "implemented" },
  {
    sourceLines: [162],
    status: "skipped",
    note: "Absolute/label to PC-relative conversion requires final layout and is already handled by vasm; intentionally out of scope for source-only linting.",
  },
  {
    sourceLines: [488],
    status: "deferred",
    note: "JSR/JMP call-chain rewrite changes return-address mechanics and needs stronger interprocedural/control-flow proof.",
  },
  {
    sourceLines: [632],
    status: "deferred",
    note: "MOVEQ+LSL constant synthesis is primarily a size-vs-speed trade-off; defer until optimization-goal/impact policy is implemented.",
  },
  {
    sourceLines: [642, 710],
    status: "deferred",
    note: "BCHG-based constant synthesis is obscure and CPU-dependent; defer until measured impact/correctness validation.",
  },
  {
    sourceLines: [847, 850],
    status: "rejected",
    note: "These memory-indirect folds save no bytes and ASP68K marks them slower on 68030/040/060; 68020 timing is unknown, so they are not useful lint optimizations as documented.",
  },
  {
    sourceLines: [853],
    status: "rejected",
    note: "As written, dropping Ax from (bd,Ax) changes the effective address unless an unstated condition makes Ax zero/suppressed; ASP68K gives no such condition.",
  },
  {
    sourceLines: [856],
    status: "rejected",
    note: "ASP68K itself records no speed or size benefit on any listed CPU; this is syntax canonicalization rather than an optimization.",
  },
  {
    sourceLines: [859],
    status: "deferred",
    note: "RTD sequence fold needs explicit stack/return-address semantics and processor legality checks.",
  },
  {
    sourceLines: [863],
    status: "deferred",
    note: "MOVE16 is 68040-specific and sensitive to alignment/cache/bus behavior; treat as a later architecture advisory.",
  },
  {
    rule: "optimization/address-expression-to-lea",
    sourceLines: [899, 905],
    status: "partial",
    note: "Implemented for a full-width MOVEA.L base copy followed by signed-16-bit ADDA/SUBA immediate and ADDA.W/L Dn. MOVEA.W is intentionally excluded because it sign-extends the low word rather than preserving the full base address.",
  },
  {
    sourceLines: [912],
    status: "deferred",
    note: "Continuation row of the MOVEM postincrement expansion; handled with the deferred MOVEM sequence work.",
  },
  {
    sourceLines: [925],
    status: "rejected",
    note: "ASP68K writes MOVEQ #n,Az, but MOVEQ cannot target an address register. The documented sequence is invalid as written, so no rule is emitted without a corrected source form.",
  },
  {
    sourceLines: [1162, 1167],
    status: "deferred",
    note: "SUBQ/branch to DBcc conversion needs loop/control-flow reasoning and target-specific cost modelling.",
  },
  { rule: "optimization/prefer-addq-negative-sub", sourceLines: [1148], status: "implemented" },
  { rule: "optimization/prefer-subq", sourceLines: [1152], status: "implemented" },
  { rule: "optimization/address-sub-to-lea", sourceLines: [1156], status: "implemented" },
  {
    sourceLines: [1160],
    status: "rejected",
    note: "SUBQ.W #n,An and SUBQ.L #n,An both take 8(1/0) on 68000; see the ADDQ row. The transform changes nothing.",
  },
];

export function asp68kCoverageSummary() {
  const byStatus = { implemented: 0, partial: 0, deferred: 0, rejected: 0, skipped: 0 } satisfies Record<
    Asp68kCoverageStatus,
    number
  >;
  const trackedRows = new Set<number>();
  const implementedRows = new Set<number>();
  for (const entry of asp68kCoverage) {
    for (const line of entry.sourceLines) {
      trackedRows.add(line);
      if (entry.status === "implemented") implementedRows.add(line);
    }
    byStatus[entry.status] += entry.sourceLines.length;
  }
  return {
    totalTransformRows: ASP68K_TOTAL_TRANSFORM_ROWS,
    trackedRows: trackedRows.size,
    implementedRows: implementedRows.size,
    untrackedRows: Math.max(0, ASP68K_TOTAL_TRANSFORM_ROWS - trackedRows.size),
    byStatus,
  };
}
