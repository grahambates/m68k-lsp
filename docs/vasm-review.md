# vasm m68k optimisation review

This file tracks optimisations derived from vasm's m68k history/source notes separately from ASP68K and Flamewing provenance.

## Implemented

- `ANDI.? #-1,<ea> -> TST.? <ea>` (`optimization/andi-all-ones-to-tst`)
  - Register destination: exact value and CCR equivalence.
  - Memory destination: manual-review only because ANDI is a read-modify-write while TST is read-only; memory-mapped I/O may observe the difference.
- `ORI.? #0,<ea> -> TST.? <ea>` (`optimization/ori-zero-to-tst`)
  - Same memory-side-effect caveat.
- `EORI.? #0,<ea> -> TST.? <ea>` (`optimization/eori-zero-to-tst`)
  - Same memory-side-effect caveat.
- `CMPA.L #x,An -> CMPA.W #x,An` for signed 16-bit x (`optimization/narrow-cmpa-immediate-word`).
  - CMPA.W sign-extends its source and therefore preserves the 32-bit comparison and CCR.

## Already covered

- `LEA (d,An),An -> ADDQ/SUBQ`
- `ASL #1 -> ADD`, selected `ASL #2 -> ADD+ADD`
- power-of-two MUL transforms
- `LEA 0,An -> SUBA.L An,An`
- single-register MOVEM -> MOVE
- many address-immediate `.L -> .W` forms

## Deferred

- Two-register `MOVEM -> MOVE+MOVE`.
  - vasm history records fixes for predecrement/postincrement cases when a register in the list also participates in the addressing mode. We should reproduce those exact ordering/address-update semantics before enabling this rule.
- `AND #0,<ea> -> CLR <ea>`.
  - Value and arithmetic flags agree, but memory/bus side effects vary by CPU/addressing context and should be reviewed alongside the planned speed/size/bus policy.
- `LINK An,#0 -> PEA (An); MOVE.L SP,An`.
  - Same encoded size; usefulness is target-speed dependent, so defer until impact/goal ranking is wired in.
- `FDIV #2^n,FPn -> FMUL #2^-n,FPn`.
  - Requires FPU semantic/precision modelling beyond the current integer analyser.

## v0.37 source-code pass

The m68k backend source confirms a distinct `-opt-speed` policy rather than merely a collection of peepholes. It also provides exact conditions for several multiply transforms:

- `MULS.L #-1,Dn -> NEG.L Dn`.
- `MULS.W #-1,Dn -> EXT.L Dn; NEG.L Dn` under speed optimization.
- `MULS.L #-2^n,Dn -> ASL.L #n,Dn; NEG.L Dn` for powers through 256 under speed optimization.

These are implemented by `optimization/negative-signed-multiply`, with X/V/C liveness checked independently rather than inheriting vasm's assembler-level side-effect policy.

The source also makes the two-register MOVEM rule more specific than the history summary: it is speed-oriented and CPU/addressing-mode gated, and vasm has had bug fixes involving instruction sizing and pre/postincrement/list interactions. Keep this deferred until our MOVEM operand-order model can encode those cases exactly.

The EAB thread itself was not reliably retrievable during this pass. Community-derived candidates should therefore continue to cite Flamewing or another directly accessible source until the original post can be verified.
