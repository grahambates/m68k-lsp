# 68000 Tricks and Traps review

Source: Mike Morton, “68000 Tricks and Traps”, BYTE, September 1986.

## Implemented

- Small `CMP.L #imm,Dn` via `MOVEQ #imm,Ds; CMP.L Ds,Dn` when `imm` fits MOVEQ and a dead scratch data register exists.
- `CMP.W/L #1..8,Dn` followed by a conditional branch -> `SUBQ.W/L #n,Dn` plus the same branch when `Dn` and X are dead after the branch. Negative-immediate ADDQ variants are intentionally not included because carry semantics require branch-condition-aware proof.
- `JSR sub; JMP next` -> `PEA next; JMP sub` when no intervening label permits alternate entry.

## Already covered elsewhere

- `JSR sub; RTS` -> `JMP sub`.
- Clear data/address registers.
- Shift-by-1/2 and large-shift SWAP/CLR/EXT sequences.
- Several rotate and mask identities.

## Advisory / deferred

- Fast sign extension of arbitrary N-bit fields: useful, but needs a clear way to infer the intended field width / known-zero upper bits from surrounding code.
- Unaligned-word load using byte push through SP: deliberately deferred because it uses the stack as scratch and introduces memory/interrupt observability.
- Loop unrolling / branch-direction advice: better represented as higher-level performance advisories after loop recognition.
- Return-address-in-address-register calling convention: valid hand-coding technique, but changes ABI/register conventions and is not a local rewrite.
