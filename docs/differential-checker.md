# The differential checker

`npm run verify:semantics`

The impact audit proves a replacement is _cheaper_. Until this existed, nothing
proved it was _equivalent_ — every rule's semantics rested on hand-reasoning
recorded in a comment. The checker takes the before and after of each audit
case, runs both on an m68k interpreter from a seeded machine state, and compares
all sixteen registers and the five condition-code bits.

## It is a bug finder, not a prover

The interpreter is [`@specy/s68k`](https://www.npmjs.com/package/@specy/s68k),
whose own documentation says: "It wasn't made to assemble or make actual
programs, but merely as a learning tool, don't expect 100% accuracy." That is
disqualifying for an oracle, so it is not treated as one. A difference means a
rule and an interpreter disagree; a human decides which is wrong. In practice
the interpreter has been right more often than the rules, but not always — see
_Known divergences_ below.

This is why the checker is not part of `npm test` and does not gate CI.

## Calibration comes first

`scripts/conformance.mjs` holds 29 cases whose 68000 result is documented in the
programmer's reference, chosen for the semantics the rules actually depend on:
which instructions write X, what the word multiply and divide forms do with the
halves of a register, and the shift and extension edges. The checker runs these
before anything else and reports the score. All 29 currently agree.

Calibration is not ceremony. Two of the first failures were errors in the
expectations, not the interpreter: `moveq #$80` is out of range, exactly as vasm
warns, and a `cmp` case documented the wrong carry.

## Reading the output

Results fall into three buckets.

**Identical everywhere** — registers and flags match on every seed.

**Differ only in declared flags** — the registers match and the rule declares
`applicability: "conditional"`, meaning it has said it changes the condition
codes and fires only where they are dead. This is the rule working as
documented, not a defect. Most of the multiply and shift recipes live here.

**Unexplained** — either a register differs, which no applicability excuses, or
a rule claiming `safe` changed a flag. These are the ones to look at.

## What it has found

Three real defects, all of the same shape — a rule claiming `safe` while
changing a condition code, or an identity that was simply wrong:

- **`optimization/quick-negative`** declared `safe` with no flag check. ADD sets
  C on a carry out where SUB sets it on a borrow, so the two forms leave
  opposite C and X for the same operands.
- **`optimization/prefer-link-sequence`** declared `safe` with no flag check.
  LINK sets no condition codes; the opening `MOVE.L a6,-(SP)` it replaces sets N
  and Z and clears V and C.
- **`optimization/negate-add-power-of-two-to-eor`** was off by one. XOR by a
  mask `m` maps `x` to `m-x`, so the identity pairs with `ADD #m`, not with the
  next power of two: `neg`/`add #8` of 3 is 5 where `eor #7` of 3 is 4. The rule
  matched the power of two and emitted the mask. It is now
  `optimization/negate-add-mask-to-eor` and matches the mask.

Each is covered by a unit test, so they stay fixed without needing the checker.

## Assembler differences, which are not rule defects

The interpreter's assembler is stricter than a real one, so `adapt()` normalises
source into what it accepts. None of the rewrites changes semantics:

- `EOR` with an immediate becomes `EORI`.
- The bit and word-multiply instructions take one operand size each, which it
  refuses to see written out, so the suffix is stripped.
- `ADD`/`SUB`/`MOVE`/`CMP` into an address register become `ADDA`/`SUBA`/`MOVEA`/`CMPA`.

The third matters most. A real assembler selects the address form silently, and
MOVEA, ADDA and SUBA set no condition codes; the interpreter instead runs the
data form and invents flags. Left alone it reports a flag difference for every
rule that touches SP or an address register, which is how `prefer-link-sequence`
twice appeared to be unsafe for the wrong reason.

## Known divergences

Behaviour where the interpreter is known to differ from a 68000. Cases that
would land on one are skipped with a stated reason rather than reported.

- **A byte push through SP.** A 68000 adjusts A7 by two on a byte access to keep
  the stack even; the interpreter adjusts by one. Anything pushing or popping a
  byte via SP has an incomparable stack pointer.

## Two harness artifacts

Also skipped, and also not rule defects:

- **A fixture that loads a label address.** A shorter replacement moves every
  label after it, so the address loaded differs purely because of the splice.
- **Instructions the interpreter does not implement** — `addx`, `subx`, `roxl`
  and `tas` among them. These are reported as skips naming the instruction.

## The interpreter leaks

It panics with a WASM `unreachable` after roughly 250 instantiations and exposes
no way to dispose one. The work is therefore sharded across child processes,
each staying well under that ceiling; `SHARD_SIZE` in the script sets the split.
Without this, only 14 of 80 cases ran.
