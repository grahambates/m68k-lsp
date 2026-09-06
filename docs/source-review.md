# Follow-on source review

This project treats ASP68K as the first historical corpus. The following sources are a second-stage backlog and should retain separate provenance.

## vasm m68k optimizations

High-value candidates not already covered (or worth re-checking independently):

- `ANDI.? #-1,<ea> -> TST.? <ea>` — likely exact CCR/value equivalence for ordinary legal destinations.
- `ORI.? #0,<ea> -> TST.? <ea>` and `EORI.? #0,<ea> -> TST.? <ea>` — same-value replacement; verify destination legality and bus side effects for memory.
- `AND.? #0,<ea> -> CLR.? <ea>` — value/CCR-equivalent architecturally, but memory-mapped I/O and bus-cycle behavior warrant conditional/manual treatment.
- two-register `MOVEM` -> two `MOVE`s under `-opt-movem` / `-opt-speed` — target and goal dependent.
- `<op>.L #x,An -> <op>.W #x,An` when x fits signed word — especially CMPA; many ADD/SUB/MOVE cases overlap existing rules.
- FPU constant-size reductions and `FDIV #2^n -> FMUL #2^-n` — later FPU rule pack.
- speed-only multi-instruction rewrites should be tied to future goal/impact policy rather than enabled unconditionally.

Important vasm correctness note: signed division by powers of two is _not_ generally reducible to ASR because DIVS rounds toward zero while ASR rounds downward for negative values.

## 68000 Tricks and Traps

Candidate lints/advisories include:

- redundant `TST` after an instruction which already set the relevant CCR (implemented independently).
- tail-call `JSR ... / RTS -> JMP ...` (already covered).
- fast-call idioms using an address register for the return address — potentially an advisory, not a general rewrite.
- `JSR sub / JMP next -> PEA next / JMP sub` — changes return-address mechanics; requires strong control-flow/stack proof.
- small-case dispatch using DBcc — advisory/algorithmic rather than a local peephole.
- bit-mask membership tests — higher-level advisory requiring range proof.
- address/data-register semantic traps (word address ops sign-extend; address ops do not set CCR) — useful correctness rules.

## EAB optimization thread / community material

The thread is [68000 code optimisations](https://eab.abime.net/showthread.php?t=57587), at least eight pages long and still live.

It cannot be retrieved automatically, and the reason is settled rather than intermittent: the board sits behind Anubis bot protection, which answers every request with `Access Denied` regardless of the URL form. `showthread.php`, `printthread.php` and an explicit `&styleid=` were all tried, and web.archive.org is unreachable from this environment. Mining it needs someone to open it in a browser and save the pages locally; there is no point retrying the fetch.

Until then the closest available substitute is a modern community compilation by Flamewing, which appears to incorporate ASP68K, Tricks and Traps, and selected Amiga forum posts. It contains many additional 68000-specific peepholes, especially:

- rotate-count normalization (`ROL` vs `ROR`, `SWAP` combinations),
- aggressive variable-shift reductions when shift-count registers are known constants,
- mask-clearing idioms (`ANDI.L #$ffff` / `#$ffff0000`),
- additional address-register `LEA` folds,
- multiply/divide-by-constant recipes with explicit 68000 cycle/read/write/size deltas.

These should be reviewed individually rather than imported wholesale. Several intentionally change flags, scratch registers, or high-word results and therefore map well to the existing liveness/sub-register analyses.

## EAB thread audit

Mined from the saved thread. Three rules landed: `mask-via-moveq`,
`data-register-sign-bit-to-tas` and `fold-index-into-effective-address`.

Two claims did not survive measurement, and one rule was removed as a result.

**ADDQ/SUBQ.L to an address register is not slower than the word form.** ASP68K
records a speed win, and `M68000UM` lists `ADDQ.W #<data>,An` as `4(1/0)`.
Yacht records that figure as an error: the same microwords drive both forms,
patent USP4325121 gives `8(3/0)`, and real-hardware evaluation confirms 8
cycles. The thread says the same independently, from measurement. Exact
auditing here agrees, and there is no size difference either, so
`addq-address-word-size` and `subq-address-word-size` were removed and their
ASP68K rows marked rejected.

**MOVEM.W does not pay for itself on one register.** Replacing `move.w`/`ext.l`
with `movem.w` to get the sign extension free measures as a regression for a
single register: same size, four cycles and one read worse. The thread says so
too, in passing: MOVEM only breaks even at three registers, and two are faster
"only because of the desired sign extends". A rule for this would have to match
two or more loads from consecutive addresses into consecutive registers,
followed by their extensions. That is a narrow pattern needing a sequence
matcher, and is not implemented.

Still unmined from the thread: `and.w #2^n-1` for the remainder of a
power-of-two division, and the `subx.l dn,dn` carry-to-mask idiom.

## Flamewing rotate/shift audit (v0.26)

The register-count rotate recipes were checked as rotation identities rather than accepted from the table. For word rotates, a known count 8..15 can be replaced by an immediate rotate in the opposite direction by `16-count`. For long rotates, counts 9..31 reduce through the 16-bit `SWAP` identity and/or the opposite direction modulo 32. Removing the preceding `MOVEQ` is only safe when its count register is dead after the rotate or already held the same constant before the sequence.

Flamewing labels these rows "wrong flags". The verified difference for equivalent ROL/ROR forms is narrower: N/Z reflect the same result and V is cleared by both forms; C can differ because the final bit shifted out is different. X is unaffected by ROL/ROR.

`ROXL #1` is value-equivalent to `ADDX Dn,Dn`, and two ADDX operations implement `ROXL #2` for byte/word operands. Final X/C and result N agree; ADDX's overflow and cumulative-Z semantics differ, so V/Z liveness is required.

`LSL.B #7,Dn -> ROR.B #1,Dn; ANDI.B #$80,Dn` was independently verified. It preserves the byte result and N/Z/V, but not X/C. Flamewing reports it as faster on 68000 while four bytes larger, so it is tagged as a speed/size tradeoff.
