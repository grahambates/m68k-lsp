# Flamewing M68000 peephole audit

Source: Flamewing, **M68000 Peephole Optimizations**.

This source is treated as a candidate corpus, not as ground truth. Every row should be checked for:

1. value equivalence;
2. CCR equivalence or observable flag differences;
3. register/sub-register side effects;
4. CPU applicability;
5. encoded byte delta;
6. timing/read/write-cycle claims where we can independently measure them.

## First discrepancy found

The source lists `MOVEA.L #val,An -> MOVEA.W #val,An` for signed 16-bit values and reports a 4-byte space saving. The transform is valid because `MOVEA.W` sign-extends its source, but the normal encodings are 6 bytes (`MOVEA.L #imm32,An`) versus 4 bytes (`MOVEA.W #imm16,An`), so the encoded-size delta is 2 bytes, not 4.

This is a useful example of why provenance and verification remain separate in m68k-lint.

## First implemented tranche

- signed-16-bit `MOVEA.L #imm -> MOVEA.W #imm`;
- signed-16-bit `ADDA.L/SUBA.L #imm -> .W`;
- `ANDI.L #$0000FFFF,Dn -> SWAP/CLR.W/SWAP` with CCR liveness;
- `ANDI.L #$FFFF0000,Dn -> CLR.W Dn` with CCR liveness;
- byte immediate rotate normalization (`ROL #5..7 <-> ROR #3..1`) with CCR liveness.

Existing rules already cover several Flamewing entries, including `CLR.L Dn -> MOVEQ`, address-register zeroing, quick add/sub forms, one-bit left shifts, many large shifts, multiply constants, and DIVU powers of two.

## Shift tranche (v0.27)

Independently verified and implemented:

- register-count `LSL`/`ASL`/`LSR` where the effective 68000 count is at least the operand width and therefore the value result is zero;
- `LSR.B #7 -> ADD.B/SUBX.B/NEG.B`; the byte result is exact, while final X/C differ;
- `ASR.B #7/#8 -> ADD.B/SUBX.B`; the byte result is exactly sign saturation to `$00`/`$FF`, while CCR semantics differ (notably SUBX cumulative-Z behaviour).

The stack-assisted word/long shift recipes are intentionally still deferred. Although several are algebraically valid, using `SP` as a temporary changes memory traffic and can matter for interrupt-sensitive or stack-sensitive code. They should be controlled by an explicit policy rather than silently emitted as ordinary peepholes.

## Register-count/address tranche (v0.28)

Independently verified and implemented:

- known register-count `LSL.W`/`ASL.W` counts 10..15 and `LSR.W` counts 10..14 reduced to rotate+mask forms. The identities were exhaustively checked over all 65,536 possible word inputs;
- known register-count `LSL.L`/`ASL.L`/`LSR.L`/`ASR.L` counts 16..23 reduced to the already-verified immediate-count word/SWAP/clear-or-extend sequences;
- `ADDA.W #disp,An` or `SUBA.W #disp,An` followed by `ADDA.{W|L} Xn,An` folded into a single indexed `LEA` when the signed displacement fits the 68000 brief-index range and `Xn != An`.

For all register-count shift rewrites, the preceding `MOVEQ` is only removed if the count register is dead afterwards or was already known to hold the same constant before the setup. CCR differences remain guarded by flag liveness.

The address fold rejects `Xn == An`: in the original sequence the second ADDA observes the address register after the first immediate adjustment, which is not equivalent to using the old value as both LEA base and index.

## Arithmetic-shift/multiply tranche (v0.29)

Independently verified and implemented:

- known register-count `ASR.W` counts 15..63 and `ASR.L` counts 31..63 reduced to `ADD`/`SUBX` sign-saturation. The data result is exactly 0 or -1 at the operand width; CCR differences, including SUBX cumulative-Z behaviour, remain guarded by flag liveness;
- full-result signed-word constant multiply recipes for factors 11, 13..26, 29..31 and 33..35 where Flamewing provides a faster 68000 sequence. Factors already handled by the ASP68K-derived rules are left to those existing rules. Every added recipe was checked as an integer coefficient identity after the initial `EXT.L`;
- a conservative subset of Flamewing's low-word-only signed multiply recipes (3, 5, 7, 9, 15, 17, 31). These only fire when `upperWordUseAfter()` proves the resulting upper word is discarded before any read, and when a scratch data register is dead.

The unsigned multiply recipes which deliberately return the result in a different register remain deferred. They need value-use substitution / result-register renaming analysis rather than mere scratch-register liveness.

## Final linear Flamewing tranche (v0.32)

Independently verified and implemented a conservative subset of Flamewing's
unsigned word-multiply table for factors 1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17,
31 and 32.

These are deliberately **low-word-only** optimizations. `MULU.W` normally
produces a full 32-bit zero-extended product, whereas the replacement word
arithmetic only guarantees the low 16 bits. The rule therefore fires only
when `dataRegisterBitsUseAfter()` proves bits 16..31 of the destination are
unobserved before a definite overwrite. Scratch-using variants additionally
require a dead data register. All CCR differences are checked through flag
liveness.

This is the last planned linear sweep through the Flamewing list. Remaining
entries are now better approached opportunistically when another source or a
new analysis capability gives us a reason to revisit them.

## v0.36: re-audit of SP-scratch shifts

Using SP as a small, bounded scratch area is no longer itself grounds for deferral. The following Flamewing sequences were independently value-checked and promoted:

- `ASR.W #8,Dn` via a 2-byte stack word/byte shuffle plus `EXT.W`.
- known register count 9 `LSL/ASL.W` via the A7 byte-stack shuffle plus `ADD.W`.
- known register count 24/25 `LSL/ASL.L` via the A7 byte-stack shuffle, `SWAP`, and clear.
- known register count 24 `LSR.L` via `SWAP`, a 2-byte stack scratch word, and byte restore.
- known register count 24 `ASR.L` via `SWAP`/`EXT`, a 2-byte stack scratch word, and byte sign-extension.

All have `temporaryStackBytes=2`, `netStackBytes=0`, and restore SP exactly. They remain *conditional* rather than unconditionally safe because a register-only shift becomes stack memory traffic and may therefore expose stack-memory/bus-fault side effects. CCR differences are analysed separately.
