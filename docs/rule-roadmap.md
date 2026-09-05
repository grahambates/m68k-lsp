# Rule roadmap: correctness, suspicious, portability, performance, style

The optimization category is substantially complete at 106 rules. The other five
are not:

| Category       | Rules | Notes                                                         |
| -------------- | ----- | ------------------------------------------------------------- |
| `optimization` | 106   | ASP68K, Flamewing and vasm corpora largely worked through     |
| `suspicious`   | 8     | one general footgun pack (v0.43) plus one Amiga rule          |
| `style`        | 7     | v0.44 conventions, opt-in                                     |
| `correctness`  | 3     | two are Amiga-only; only `stale-condition-code` is generic    |
| `performance`  | 0     | exposed in the CLI, schema and config, with nothing behind it |
| `portability`  | 0     | same, despite `--cpu` already accepting seven processors      |

`portability` is the largest and cheapest win. The linter already takes a
processor list and 30+ rules already gate on it, but nothing tells a user that
the code they just wrote will not run on the CPU they selected.

These proposals follow the existing policy: the linter does not duplicate
assembler validation. Anything an assembler rejects outright (illegal size,
illegal addressing mode, out-of-range MOVEQ) is out of scope unless the linter
can add materially better semantic or contextual information.

## Enabling work

Three pieces of shared infrastructure unlock most of what follows. Each is
useful on its own.

### 1. A CPU capability table (`src/semantics/cpu.ts`)

Today CPU gating is written inline and repeated:

```ts
ctx.config.processors.every((cpu) => cpu === "mc68000")                                    // 8 sites
ctx.config.processors.every((cpu) => ["mc68000", "mc68010", "mc68030"].includes(cpu))      // 6 sites
ctx.config.processors.every((cpu) => ["mc68000", "mc68010", "mc68030", "mc68040"]...)      // 6 sites
```

A single table mapping instruction and addressing mode to the processors that
support it would:

- turn the whole "not available on your target" family below into one
  table-driven rule each, rather than one rule per instruction;
- replace the duplicated inline predicates with `supportsInstruction(cpu, mn)`;
- give `--list-rules` and the docs a single place to state CPU applicability.

This is the highest-leverage item on the page.

### 2. Expose the label index from the CFG

`buildControlFlowGraph` already builds `Map<labelName, instructionIndex>` but
keeps it private, and it maps a label to the _next instruction_, so a label
sitting on a `DC`/`DS` line is indistinguishable from one on code.

Exposing both the raw label position and the resolved target, plus which labels
are referenced, unlocks the reachability and data/code confusion rules.

### 3. A section/data model

Several rules need to know whether an address is code or data. The parser gives
`directive` nodes for `DC`/`DS`/`SECTION`; a small pass classifying each line as
code, data or storage would support the branch-into-data and self-modifying-code
rules and would also sharpen `suspicious/unexpected-absolute-address`.

## portability

The premise: the user told us their target with `--cpu`. Every rule here is
"this does not do what you think on the processor you selected". All are
feasible with the capability table; none need new dataflow.

| Proposed ID                                   | Flags                                                                                        | Why it matters                                                                                                                                                                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `portability/instruction-not-available`       | Table-driven: an instruction absent from a selected target                                   | `MOVEP` is gone on 68060 and ColdFire; `PACK`/`UNPK`/`CAS`/`CHK2`/`CMP2`/bitfield ops/`LINK.L`/`BRA.L` are 68020+; `CALLM`/`RTM` exist only on the 68020                              |
| `portability/addressing-mode-not-available`   | Scaled index (`scaleFactor` > 1), memory-indirect, 32-bit displacement, on pre-68020 targets | The parser exposes `scaleFactor` and `memory-indirect` directly, so this is cheap and certain                                                                                         |
| `portability/move-from-sr-privileged`         | `MOVE SR,<ea>` when any target is 68010+                                                     | The canonical 68k portability trap: unprivileged on 68000, **privileged from the 68010**, so user-mode code that worked on a 68000 traps. `MOVE CCR,<ea>` is the portable form        |
| `portability/clr-memory-access-differs`       | `CLR.x <mem>` when targets span 68000 and 68010+                                             | The 68000 `CLR` to memory performs a read _and_ a write; from the 68010 it is write-only. Visible to memory-mapped I/O and to bus-cycle-sensitive hardware                            |
| `portability/movem-predecrement-base-in-list` | `MOVEM.x <list>,-(An)` where `An` is itself in the list                                      | The value stored for the base register differs between the 68000 and 68020+                                                                                                           |
| `portability/misaligned-access`               | Word/long access to a provably odd address                                                   | Address error (fatal) on 68000/68010; permitted but slower on 68020+. Pairs with the `correctness` and `performance` rules below — same detection, three different verdicts by target |
| `portability/long-multiply-divide-emulated`   | 64-bit result `MULS.L`/`MULU.L`/`DIVS.L`/`DIVU.L` when 68060 is a target                     | The 68060 traps these and emulates them in software, so a "fast" long multiply becomes very slow                                                                                      |
| `portability/fpu-instruction-without-fpu`     | FPU mnemonics when no selected target has an FPU                                             | The parser already models `fpu-data-register` and `fpu-control-register`                                                                                                              |
| `portability/self-modifying-code-cache`       | A store whose destination resolves to a code label, when targets are 68020+                  | Needs the section model. Correct on a 68000; needs explicit cache flushing from the 68020                                                                                             |

Worth noting: `misaligned-access` demonstrates why the categories are worth
keeping distinct. The same detection is a `correctness` error on 68000, a
`portability` finding for a mixed target list, and a `performance` note on
68020+.

## correctness

Reserved for valid assembly with a _provable_ semantic or runtime problem.

| Proposed ID                              | Flags                                                                            | Feasibility                                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `correctness/odd-address-word-access`    | Word/long access to a known-odd absolute address on 68000/68010                  | Ready now. `ctx.evaluate` resolves the address; odd is certain, not heuristic. Guaranteed address error                                  |
| `correctness/divide-by-zero-immediate`   | `DIVU`/`DIVS` by a literal or constant-folded zero                               | Ready now. Guaranteed trap; nothing heuristic about it                                                                                   |
| `correctness/branch-into-data`           | Branch/jump whose target label sits on a `DC`/`DS` line                          | Needs the label index and section model                                                                                                  |
| `correctness/fallthrough-into-data`      | Code falling through into a data directive with no intervening `RTS`/`BRA`/`JMP` | Needs the section model. A genuinely common bug when a routine loses its terminator during editing                                       |
| `correctness/movem-restore-mismatch`     | A routine whose `MOVEM` save list does not match the matching restore list       | CFG is available. Restoring fewer registers than were saved corrupts the stack; restoring a different set silently clobbers caller state |
| `correctness/unbalanced-stack-on-return` | A path to `RTS` whose net stack adjustment is non-zero                           | Most ambitious here. Needs stack-depth tracking over the CFG, but the CFG exists and the payoff is high                                  |

## suspicious

Valid code that may well be intentional but is easy to misread or get wrong.

| Proposed ID                                   | Flags                                                                                     | Why                                                                                                                                                                                                                             |
| --------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `suspicious/byte-stack-adjust`                | `MOVE.B <ea>,-(SP)` or `MOVE.B (SP)+,<ea>`                                                | **A7 is special-cased**: byte predecrement/postincrement adjusts the stack pointer by 2, not 1, to preserve alignment. Code that pushes a byte and pops a byte balances; code that pushes a byte and adds 1 does not. Ready now |
| `suspicious/moveq-sign-extension`             | `MOVEQ` with an immediate in `$80..$FF`                                                   | `moveq #$ff,d0` leaves `$FFFFFFFF`, not `$000000FF`. Extremely common misunderstanding. Ready now                                                                                                                               |
| `suspicious/dbcc-long-counter`                | `DBcc` whose counter register provably holds a value above 65535                          | `DBcc` decrements and tests only the low word, so a long count silently loops the wrong number of times. Register constant propagation already supports this                                                                    |
| `suspicious/dbcc-counter-modified`            | The loop body writes the register a `DBcc` uses as its counter                            | Needs CFG loop detection; register analysis does the rest                                                                                                                                                                       |
| `suspicious/scc-partial-write`                | `Scc Dn` where the upper 24 bits are later read                                           | `Scc` writes only the low byte. Complements the existing `partial-register-write`, reusing `dataRegisterBitsUseAfter`                                                                                                           |
| `suspicious/clr-memory-read-modify-write`     | `CLR.x` to an absolute address in a known I/O range                                       | The 68000 reads before writing. On hardware registers with read side effects, that is a real fault. Amiga-gated initially, generic once other platforms exist                                                                   |
| `suspicious/unreachable-code`                 | Instructions with no CFG predecessors and no label                                        | Ready now. Usually a deleted branch or a lost label                                                                                                                                                                             |
| `suspicious/pointer-compare-signed-condition` | Address-register or pointer comparison followed by `BGT`/`BLT`/`BGE`/`BLE`                | Addresses are unsigned; a pointer above `$7FFFFFFF` compares as negative. The unsigned conditions `BHI`/`BCS`/`BCC`/`BLS` are almost always meant                                                                               |
| `suspicious/word-result-used-as-long`         | A register written with a `.w` operation and later read as `.l` with no intervening `EXT` | The classic missing sign-extension bug. Register analysis already tracks sub-register writes                                                                                                                                    |
| `suspicious/immediate-looks-like-address`     | A large immediate moved to a data register that is later used as a pointer                | Heuristic, so `suspicious` is the right home. Lower priority                                                                                                                                                                    |

## performance

Currently empty. The distinction from `optimization` should be that
`optimization` is a local instruction substitution with a measured delta, while
`performance` is a cost finding that is not a substitution — something structural
the author has to fix.

| Proposed ID                                 | Flags                                                                       | Notes                                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `performance/expensive-instruction-in-loop` | `MULU`/`MULS`/`DIVU`/`DIVS` inside a detected loop                          | On a 68000 a `MULU` is ~70 cycles and a `DIVU` ~140. `68kcounter` can quantify the per-iteration cost, which makes the diagnostic concrete rather than hand-wavy. Needs CFG loop detection |
| `performance/misaligned-access-penalty`     | Word/long access to a known-odd address on 68020+                           | Same detection as the correctness and portability rules, different verdict: legal but costs an extra bus cycle                                                                             |
| `performance/branch-chain`                  | A branch whose target is itself an unconditional branch                     | Ready now. Collapse to the final target                                                                                                                                                    |
| `performance/redundant-memory-reload`       | The same memory operand read twice in a loop with a dead register available | Register analysis provides the dead-register discovery already used by scratch-register optimizations                                                                                      |

Loop-target alignment for 68020+/68040 is deliberately excluded: like branch
shortening, it depends on final layout, which the assembler owns.

## style

All opt-in, consistent with the existing `style` preset policy. Formatting proper
(whitespace, alignment, column layout) stays out of scope.

| Proposed ID                        | Flags                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `style/consistent-hex-prefix`      | Mixed `$1234` and `0x1234` in one project                                              |
| `style/consistent-register-case`   | Mixed `d0` and `D0`                                                                    |
| `style/consistent-mnemonic-case`   | Mixed `move` and `MOVE`                                                                |
| `style/prefer-symbolic-constant`   | A literal equal to the value of a defined `EQU`, where the symbol was presumably meant |
| `style/prefer-bra-over-jmp`        | `JMP label` for an in-file target that `BRA` reaches                                   |
| `style/require-local-label-prefix` | Subroutine-internal labels not using the local (`.name`) form                          |
| `style/no-trailing-nop`            | `NOP` immediately before `RTS`, usually debug residue                                  |

## Suggested sequencing

1. **CPU capability table.** Unlocks nine portability rules, removes the
   duplicated inline predicates, and gives the docs one source of truth.
2. **The ready-now footguns**, needing no new infrastructure:
   `byte-stack-adjust`, `moveq-sign-extension`, `odd-address-word-access`,
   `divide-by-zero-immediate`, `move-from-sr-privileged`,
   `addressing-mode-not-available`, `branch-chain`. Each is small, certain, and
   independently useful.
3. **Label index and section model.** Then the reachability and code/data rules:
   `unreachable-code`, `branch-into-data`, `fallthrough-into-data`.
4. **CFG loop detection.** Then `expensive-instruction-in-loop`,
   `dbcc-counter-modified`, `redundant-memory-reload`.
5. **Stack-depth tracking.** Then `movem-restore-mismatch` and
   `unbalanced-stack-on-return`, the highest-value and highest-effort pair.
6. **Style rules** whenever convenient; they are independent of everything above.

A note on the audit: `--audit-rule-impact` covers `optimization` and
`performance` only. The `performance` rules proposed here are structural rather
than substitutions, so most will need audit exemptions, and the exemption reason
should say "not a local substitution" rather than "unmeasurable".
