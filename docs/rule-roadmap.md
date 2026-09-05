# Rule roadmap: correctness, suspicious, portability, style

The optimization category is substantially complete at 106 rules. The others are
not:

| Category       | Rules | Notes                                                      |
| -------------- | ----- | ---------------------------------------------------------- |
| `optimization` | 106   | ASP68K, Flamewing and vasm corpora largely worked through  |
| `suspicious`   | 8     | one general footgun pack (v0.43) plus one Amiga rule       |
| `style`        | 7     | v0.44 conventions, opt-in                                  |
| `correctness`  | 3     | two are Amiga-only; only `stale-condition-code` is generic |
| `portability`  | 0     | despite `--cpu` already accepting seven processors         |
| `performance`  | 0     | proposed for removal, see below                            |

## The governing test

The project already says it does not duplicate assembler validation. The useful
sharpening of that rule is:

> **Would the assembler reject this?** If yes, it is the assembler's job.
> Legality belongs to the assembler. Runtime behaviour, dataflow and
> reachability belong here.

That test does real work. It rules out "this instruction or addressing mode does
not exist on your target" — vasm with `-m68000` already errors on 68020+ scaled
index, memory indirect, `PACK`/`UNPK`/`CAS`/bitfield ops, and so on. Restating
that would be noise in a second tool.

What it leaves is the more valuable class, and the one no assembler can reach:
**code that is legal on every target and assembles cleanly, but behaves
differently depending on which one runs it.** That is what `portability` should
mean here.

## portability

Every rule below assembles without complaint on every processor. The difference
only shows up at runtime.

| Proposed ID                                   | Flags                                                                       | Why the assembler cannot help                                                                                                                                         |
| --------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portability/move-from-sr-privileged`         | `MOVE SR,<ea>` when any selected target is 68010 or later                   | Legal and unprivileged on the 68000, legal but **privileged from the 68010**. User-mode code that ran for years starts trapping. `MOVE CCR,<ea>` is the portable form |
| `portability/clr-memory-access-differs`       | `CLR.x <mem>` when targets span the 68000 and later CPUs                    | The 68000 `CLR` to memory reads _and_ writes; from the 68010 it is write-only. Identical encoding, different bus cycles, visible to memory-mapped I/O                 |
| `portability/movem-predecrement-base-in-list` | `MOVEM.x <list>,-(An)` where `An` is itself in the list                     | Assembles fine everywhere. The value stored for the base register differs between the 68000 and 68020+                                                                |
| `portability/long-muldiv-emulated-on-68060`   | 64-bit-result `MULS.L`/`MULU.L`/`DIVS.L`/`DIVU.L` when 68060 is a target    | A legal 68020+ instruction that the 68060 traps and emulates in software. Silently turns a fast path into a very slow one                                             |
| `portability/self-modifying-code-cache`       | A store whose destination resolves to a code label, when targets are 68020+ | Correct on a 68000, needs explicit cache flushing from the 68020. Needs the section model below                                                                       |

These need only a small ordering helper (`isAtLeast(cpu, "mc68010")`), not a
general instruction-availability table.

## correctness

Valid assembly with a _provable_ semantic or runtime problem.

| Proposed ID                            | Flags                                                                       | Feasibility                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `correctness/odd-address-word-access`  | Word/long access to a known-odd absolute address, on 68000/68010 targets    | Ready now — `ctx.evaluate` resolves the address and odd is certain, not heuristic. Guaranteed address error. On 68020+ it is merely slower, so gate to 68000/010 |
| `correctness/divide-by-zero-immediate` | `DIVU`/`DIVS` by a literal or constant-folded zero                          | Ready now. Worth checking what vasm and Devpac already say about a literal `#0` before committing to it                                                          |
| `correctness/movem-restore-mismatch`   | A routine whose `MOVEM` save list does not match its restore list           | CFG is available. Restoring fewer registers than were saved corrupts the stack; a different set silently clobbers caller state. Miserable to debug by hand       |
| `correctness/unbalanced-stack`         | A path to `RTS` whose net stack adjustment is non-zero                      | Needs stack-depth tracking over the CFG. Highest effort here, and the highest payoff                                                                             |
| `correctness/branch-into-data`         | Branch or jump whose target label sits on a `DC`/`DS` line                  | Needs the label index and section model                                                                                                                          |
| `correctness/fallthrough-into-data`    | Code falling through into a data directive with no `RTS`/`BRA`/`JMP` before | Needs the section model. Common when a routine loses its terminator during editing                                                                               |

## suspicious

Valid code that may be intentional but is easy to get wrong.

| Proposed ID                                   | Flags                                                                                 | Why                                                                                                                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suspicious/dbcc-long-counter`                | `DBcc` whose counter provably exceeds 65535                                           | `DBcc` decrements and tests only the low word, so a long count silently loops the wrong number of times. Register constant propagation already supports this          |
| `suspicious/dbcc-counter-modified`            | The loop body writes the register the `DBcc` uses as its counter                      | Needs CFG loop detection; register analysis does the rest                                                                                                             |
| `suspicious/scc-partial-write`                | `Scc Dn` where the upper 24 bits are later read                                       | `Scc` writes only the low byte, but reads as though it set the whole register. Complements `partial-register-write`, reusing `dataRegisterBitsUseAfter`               |
| `suspicious/word-result-used-as-long`         | A register written by a `.w` operation, later read as `.l`, with no intervening `EXT` | The classic missing sign-extension bug. Register analysis already tracks sub-register writes                                                                          |
| `suspicious/pointer-compare-signed-condition` | Address-register or pointer comparison followed by `BGT`/`BLT`/`BGE`/`BLE`            | Addresses are unsigned; a pointer above `$7FFFFFFF` compares as negative. `BHI`/`BCS`/`BCC`/`BLS` are almost always what was meant                                    |
| `suspicious/unreachable-code`                 | Instructions with no CFG predecessors and no label                                    | Ready now. Usually a deleted branch or a lost label                                                                                                                   |
| `suspicious/stack-adjust-mismatch`            | A byte push to `-(SP)` cleaned up with an adjustment of 1                             | See the note below — this is the narrow, provable residue of a broader rule that had to be dropped                                                                    |
| `suspicious/clr-memory-read-modify-write`     | `CLR.x` to an absolute address in a known I/O range                                   | The 68000 reads before writing; on hardware registers with read side effects that is a real fault. Amiga-gated at first                                               |
| `suspicious/moveq-sign-extension`             | `MOVEQ` with an immediate in `$80..$FF`                                               | `moveq #$ff,d0` leaves `$FFFFFFFF`, not `$000000FF`. **Check first** whether vasm and Devpac already reject or warn on this — if they do, it fails the governing test |
| `suspicious/immediate-looks-like-address`     | A large immediate moved to a data register later used as a pointer                    | Heuristic, hence `suspicious`. Low priority                                                                                                                           |

### Why there is no general byte-stack rule

An earlier draft proposed flagging `MOVE.B <ea>,-(SP)` on the grounds that A7 is
special-cased and adjusts by 2 rather than 1.

That rule cannot exist in this linter. `optimization/stack-word-shift-eight`
**emits exactly that instruction** as its own suggestion:

```
lsl.w #8,d0  ->  move.b d0,-(sp)
                 move.w (sp)+,d0
                 clr.b d0
```

The linter would have flagged its own output. The A7 byte trick is a deliberate
and well-established shift idiom, not a footgun, and the project already
recommends it.

What survives is only the case where the adjustment genuinely does not balance:
a byte pushed to `-(SP)` and cleaned up with `addq.l #1,sp`. Once stack-depth
tracking exists for `correctness/unbalanced-stack`, that falls out of the same
model for free — A7 byte operations move the pointer by 2 — so this may not need
to be a separate rule at all.

## Dropping the `performance` category

`performance` should be removed rather than filled. Everything plausibly in it is
either an optimization or a note on an existing rule:

- branch-to-branch collapsing and redundant memory reloads are ordinary
  peephole substitutions, so they belong in `optimization`;
- the cost of a misaligned access on 68020+ is a note on
  `odd-address-word-access`, not a rule;
- "expensive instruction in a loop" is an optimization advisory, and needs CFG
  loop detection either way.

A category with no rules is not free: it appears in `RuleCategory`, the CLI
`--only` and `--disable-category` lists, the JSON schema and the config type, so
`--only performance` currently succeeds and silently matches nothing. It is also
threaded through impact measurement in two places in `lint.ts` and through the
audit.

**Decision needed:** remove it from the public surface, or keep it documented as
reserved. Removing it is a small breaking change to the config schema.

## Additions to `optimization` instead

| Proposed ID                                  | Flags                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `optimization/branch-chain`                  | A branch whose target is itself an unconditional branch; collapse it        |
| `optimization/redundant-memory-reload`       | The same memory operand read twice in a loop with a dead register free      |
| `optimization/expensive-instruction-in-loop` | `MULU`/`MULS`/`DIVU`/`DIVS` inside a loop, where strength reduction applies |

The first two are ordinary substitutions and fit the impact audit directly. The
third is an advisory without a single replacement, so it would need an audit
exemption reading "advisory, no single replacement" rather than "unmeasurable".

## style

All opt-in, consistent with existing policy. Formatting proper — whitespace,
alignment, column layout — stays out of scope.

| Proposed ID                        | Flags                                                                       |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `style/consistent-hex-prefix`      | Mixed `$1234` and `0x1234` in one project                                   |
| `style/consistent-register-case`   | Mixed `d0` and `D0`                                                         |
| `style/consistent-mnemonic-case`   | Mixed `move` and `MOVE`                                                     |
| `style/prefer-symbolic-constant`   | A literal equal to the value of a defined `EQU`, where the symbol was meant |
| `style/prefer-bra-over-jmp`        | `JMP label` for an in-file target that `BRA` reaches                        |
| `style/require-local-label-prefix` | Subroutine-internal labels not using the local (`.name`) form               |
| `style/no-trailing-nop`            | `NOP` immediately before `RTS`, usually debug residue                       |

## Enabling work

Two pieces of shared infrastructure, both smaller than the previous draft
assumed once instruction-availability rules are off the table.

### Label index from the CFG

`buildControlFlowGraph` already builds `Map<labelName, instructionIndex>` but
keeps it private, and it resolves a label to the _next instruction_, so a label
on a `DC` line is indistinguishable from one on code. Exposing the raw label
position, the resolved target, and which labels are referenced unlocks the
reachability and code/data rules.

### Section and data model

The parser gives `directive` nodes for `DC`/`DS`/`SECTION`. A pass classifying
each line as code, data or storage supports `branch-into-data`,
`fallthrough-into-data` and `self-modifying-code-cache`, and would sharpen the
existing `suspicious/unexpected-absolute-address` heuristic.

### Not needed: a CPU capability table

The previous draft proposed one to drive instruction- and addressing-mode
availability rules. Those rules are the assembler's job, so the table is not
needed. The surviving portability rules want only a small ordering helper such
as `isAtLeast(cpu, "mc68010")`.

Separately, the 30+ inline `ctx.config.processors.every(...)` predicates in the
optimization rules are still worth consolidating into named helpers, but that is
a refactor, not a prerequisite for anything here.

## Suggested sequencing

1. **Ready now, no new infrastructure:** `move-from-sr-privileged`,
   `odd-address-word-access`, `unreachable-code`, `scc-partial-write`,
   `dbcc-long-counter`, `pointer-compare-signed-condition`. Each is small,
   provable, and independently useful.
2. **Label index and section model**, then `branch-into-data`,
   `fallthrough-into-data`, `self-modifying-code-cache`.
3. **CFG loop detection**, then `dbcc-counter-modified`,
   `redundant-memory-reload`, `expensive-instruction-in-loop`.
4. **Stack-depth tracking**, then `movem-restore-mismatch`, `unbalanced-stack`
   and the narrow `stack-adjust-mismatch` case.
5. **Style rules** whenever convenient; independent of everything above.
