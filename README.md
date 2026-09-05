# m68k-lint

A conservative, extensible lint/static-analysis layer for Motorola 68k assembly, built directly on [`m68k-parser`](https://github.com/grahambates/m68k-parser).

## Platform modes

`m68k-lint` can enable platform-specific safety/correctness rules independently of the CPU target:

```sh
m68k-lint --platform amiga --cpu mc68000 game.s
```

The default platform is `generic`. The initial `amiga` mode flags unsupported `TAS` instructions and checks a conservative set of Amiga custom-chip registers for read-only/write-only access mistakes. More Amiga hardware rules can be added without affecting generic 68k linting.

The `optimization/bset-to-tas` rule is disabled by default on all platforms. It can still be explicitly enabled with `--rule optimization/bset-to-tas=suggestion` when appropriate.

Rule IDs are descriptive rather than source-named. Provenance (ASP68K, Flamewing-curated material, vasm, Tricks and Traps, etc.) is retained in rule metadata and audit documents.

## Design principles

- A rule emits a **diagnostic/finding**, not an edit.
- Suggestions may optionally contain replacement text.
- `severity` and `confidence` are independent.
- `applicability` is explicit: `safe`, `conditional`, or `manual`.
- Rules consume parser AST nodes directly.
- Cross-line/dataflow knowledge belongs behind `RuleContext`, not inside individual rules.
- Optimisation is the first rule category, not the purpose of the entire framework.
- Analysis is conservative: inability to prove a fact yields `unknown`, never an optimistic assumption.

## Current analysis

### Constants / symbols

- Constant-expression evaluation.
- File-local constant symbol table for `equ` and `=` definitions.
- Chained constant resolution with cycle protection.

`set` is deliberately not treated as a constant yet because it is mutable/order-sensitive.

### Control flow

- Builds instruction-level successors/predecessors for fallthrough and direct branches.
- Resolves direct label targets in the current file.
- Direct `JMP label` is analyzable; indirect/unresolved jumps are escape points.
- `RTS`, `RTE`, `RTR`, `STOP`, unresolved branches and indirect jumps are conservative escape points.
- Calls retain their fallthrough edge but are opaque CCR boundaries until function summaries exist.

### Condition-code analysis

Flags are modeled individually as `X`, `N`, `Z`, `V`, and `C`.

The current semantics table covers the common integer instructions needed by the initial rules and analyses. It is deliberately incomplete and should be expanded centrally rather than inside lint rules.

Two dataflow analyses are available through `RuleContext.flags`:

```ts
ctx.flags.isLiveAfter(index, "Z")
// => "dead" | "live" | "unknown"

ctx.flags.reachingDefinitionsBefore(index, "Z")
// => instruction / entry / unknown definitions
```

Important conservative cases:

```asm
add.l d0,d1
rts
```

The ADD flags are `unknown`, not dead: the caller may observe the returned CCR state.

```asm
add.l  d0,d1
move.l d2,d3
rts
```

`N/Z/V/C` from ADD are provably dead because MOVE overwrites them. `X` remains `unknown` because MOVE preserves X and the return escapes analysis.

A call with no semantic summary is also opaque: it may consume incoming CCR state and may return different flag values.

## Current rules

### Correctness

- `correctness/stale-condition-code`
  - Detects cases such as an address-register write followed by a conditional operation when no concrete earlier definition of the required flag reaches that point.
  - Correctly stays quiet for intentional preservation such as `CMP; MOVEA; BEQ`.
  - Address-register forms selected via generic mnemonics are handled too, e.g. `move.l d0,a0` and `addq.w #1,a0` do not update CCR.

### Optimisation

- `optimization/prefer-moveq`
- `optimization/prefer-addq`
- `optimization/redundant-lea`
- `optimization/null-branch`

### Suspicious

- `suspicious/self-move`
  - Manual review only: `MOVE` changes condition codes, so a self-move is not necessarily a semantic no-op.
- `suspicious/nop`
  - Disabled by default because NOPs are often deliberate for timing, patching, alignment, or debugging.

## Usage

```ts
import { lintSource } from "m68k-lint";

const diagnostics = lintSource(`
  movea.l d0,a0
  beq     .null
.null:
  rts
`);

console.log(diagnostics);
```

Programmatic flag analysis is also exposed:

```ts
import { parseFile } from "m68k-parser";
import { DefaultRuleContext } from "m68k-lint";

const source = `
  add.l  d0,d1
  move.l d2,d3
  rts
`;

const ctx = new DefaultRuleContext(
  parseFile(source),
  source,
  { processors: ["mc68000"] },
);

ctx.flags.isLiveAfter(0, "Z"); // "dead"
ctx.flags.isLiveAfter(0, "X"); // "unknown"
```

## Next analysis layers

1. Expand and verify the central instruction-semantics table.
2. Use CCR liveness to upgrade/downgrade ASP68K rules whose replacements change flags.
3. Add function/ABI summaries so known callees can preserve/clobber specific flags rather than always becoming opaque.
4. Register read/write semantics and register liveness.
5. Constant/register-value propagation across the CFG.
6. Layout/link-aware range analysis.
7. Project/include-aware symbols and inter-file CFG edges.

## Validation note

The scaffold targets the current public `m68k-parser` AST/API. This environment cannot install the real npm dependency, so the source was type-checked against a local declaration shim matching the current public 1.2.0 types. Run the full build/Jest suite after `npm install` in a normal checkout. Run the full Jest suite after `npm install` in a normal checkout.

## v0.4 rule expansion

The ASP68K rule pack now includes additional constant/peephole rules:

- `optimization/prefer-subq`
- `optimization/prefer-subq-negative-add`
- `optimization/prefer-addq-negative-sub`
- `optimization/prefer-tst-zero`
- `optimization/prefer-not`
- `optimization/prefer-bset`
- `optimization/prefer-bclr`
- `optimization/shift-to-clear`

The bit-mask and shift-to-zero rules demonstrate the intended interaction with
semantic analysis: when their replacement changes observable CCR state they are
reported as conditional; if the relevant flags are proven dead, the suggestion
is promoted to safe.


## v0.5 sequence rules

The initial short-sequence pass adds:

- `optimization/prefer-lea-quick`: `lea n(An),An` to `addq.w`/`subq.w` for displacements ±1..8.
- `optimization/jsr-rts-tail-call`: `jsr target` + `rts` as a manual `jmp target` tail-call candidate.
- `optimization/bsr-rts-tail-call`: `bsr target` + `rts` as a manual `bra target` tail-call candidate.
- `optimization/push-address-pea`: fold `move.l An,-(sp)` followed by a long immediate ADD/SUB on `(sp)` into `pea d16(An)`. The rule only fires for a signed 16-bit displacement and uses CCR liveness to classify the rewrite as safe or conditional.

Tail-call rules are deliberately `manual`: ASP68K notes the different stack depth, which can be observable to the callee.

## CLI

Version 0.6 adds a dependency-free command-line frontend. After building the package:

```sh
npm run build
node dist/cli/main.js game.s
```

When installed as a package, the `m68k-lint` executable is exposed via the package `bin` field:

```sh
m68k-lint game.s
m68k-lint --cpu mc68000 game.s
m68k-lint --cpu mc68000,mc68010 --only correctness,optimization game.s
m68k-lint --rule suspicious/nop=warning game.s
m68k-lint --preset style src/
m68k-lint --fail-on warning game.s
m68k-lint --format json game.s
m68k-lint --list-rules
```

By default, parser errors and lint diagnostics with severity `error` produce exit status 1. Warnings and suggestions are printed but do not fail the command. `--fail-on` can make CI stricter. CLI usage/configuration errors return status 2.

The CLI reports parser errors alongside lint findings, but the library API remains unchanged: callers can continue to use `lintSource` or `lintParsedFile` directly.


## v0.7 rule expansion

This batch adds more locally-provable ASP68K peephole and short-sequence rules:

- `optimization/prefer-moveq-zero`: `clr.l Dn` → `moveq #0,Dn` on 68000/68010 targets.
- `optimization/prefer-st-minus-one`: `move.b #-1,<ea>` → `st <ea>`, with CCR liveness controlling safe vs conditional applicability.
- `optimization/prefer-add-for-shift-one`: `asl/lsl #1,Dn` → `add Dn,Dn` on targets where ASP68K reports a speed win; deliberately conservative about flags.
- `optimization/prefer-move-word-address`: signed-16-bit `move.l #n,An` → `move.w #n,An`.
- `optimization/zero-address-register`: `move.w/l #0,An` → `suba.l An,An`.
- `optimization/addq-address-word-size` and `optimization/subq-address-word-size`: use `.w` quick arithmetic for address-register destinations on 68000/68010.
- `optimization/prefer-link-sequence`: recognise the standard three-instruction frame setup and suggest `LINK`.
- `optimization/prefer-unlk-sequence`: recognise the standard two-instruction frame teardown and suggest `UNLK`.

Rules that are only timing wins on particular CPUs are target-gated. Rules whose replacement changes CCR state use the existing flag-liveness analysis instead of being blindly marked safe.

### v0.8 rule additions

The rule pack now also includes:

- `optimization/btst-sign-branch`: data-register sign-bit `BTST` followed by `BEQ/BNE` → `TST` plus `BPL/BMI`, with post-branch CCR liveness checking.
- `optimization/combine-adjacent-clr-bytes` / `combine-adjacent-clr-words`: adjacent absolute-address clears that can become a wider clear.
- `optimization/combine-adjacent-move-bytes` / `combine-adjacent-move-words`: adjacent immediate stores that can become a wider store using 68k big-endian byte order.

The wider-memory-access rules are intentionally **manual** suggestions even when the addresses are provably adjacent. A pair of byte/word accesses is not universally interchangeable with one wider bus access for memory-mapped I/O, hardware registers, or fault boundaries.

## ASP68K coverage tracking

v0.9 starts a machine-readable coverage manifest for the historical ASP68K table. It is intentionally incremental: the table contains 181 transformation rows, and the manifest distinguishes implemented, partial, deferred and rejected rows.

```bash
m68k-lint --asp68k-coverage
```

Layout-dependent branch/PC-relative rules and DIV/MUL rules are explicitly marked deferred rather than being guessed from source text alone.

### v0.9 local peepholes and audit fixes

- Tightens `optimization/prefer-tst-zero` so address-register and unsupported operand forms are not suggested by the generic rule.
- `optimization/redundant-zero-displacement`: `0(An)` → `(An)`.
- `optimization/address-add-to-lea` / `address-sub-to-lea`: larger signed-16-bit immediate address-register arithmetic → `LEA`, target-gated.
- `optimization/push-immediate-pea`: signed-16-bit immediate longword stack pushes → `PEA`, with CCR liveness.
- `optimization/single-register-movem`: single-register `MOVEM` → `MOVE`, including the `MOVEM.W`→Dn sign-extension exception and CCR review.
- `optimization/bset-low-word-mask` / `bclr-low-word-mask`: low-word bit operations → word masks when useful, with CCR liveness.
- `optimization/shift-two-adds`: byte/word two-bit left shifts → two ADDs on CPUs where ASP68K reports a speed win; code-size and CCR tradeoffs are explicit.
- Extends `optimization/btst-sign-branch` to the documented byte-memory form.
- Fixes the reverse `OR/AND`→`BSET/BCLR` rules to require the documented `.L` form and target CPU timing profile, avoiding suggestion cycles with the new `.W` mask rules.

## Register analysis (v0.10)

The rule context now exposes conservative general-purpose register analysis alongside CCR analysis:

- per-register liveness: `dead | live | unknown`
- definite constants before/after an instruction
- constant/copy propagation for straightforward full-register writes
- conservative knowledge loss at calls, unknown instruction semantics, and CFG joins
- dead data-register discovery for scratch-register optimisations

The first ASP68K rules using it are `optimization/known-zero-clear` and `optimization/move-immediate-via-scratch`.

## Future rule sources after ASP68K

Once the ASP68K corpus is substantially covered, useful follow-on sources to audit include:

- Paul R. Santa-Maria, **68k Tricks and Traps** — http://www.easy68k.com/paulrsm/doc/trick68k.htm
- **vasm** optimisation documentation and implementation, especially non-default optimisations — http://sun.hasenbraten.de/vasm/release/vasm_25.html
- English Amiga Board optimisation discussion — https://eab.abime.net/showthread.php?t=57587

These should be tracked separately from ASP68K provenance so overlapping, corrected, CPU-specific, or disputed rules can be reconciled explicitly rather than silently merged.

### v0.11 register-analysis tranche

- Models MOVEM register-list reads/writes so scratch/liveness analysis does not treat MOVEM as an opaque instruction.
- Propagates definite full-register constants through more immediate arithmetic, logical operations, NOT/NEG/SWAP/EXT and long shifts.
- Adds `optimization/cmp-zero-address-via-scratch` for the conservative `.L` form when a data register is provably dead.
- Adds `optimization/combine-consecutive-addq`, with per-flag CCR safety for data registers.

The CMP-address optimisation intentionally excludes the historical `.W` spelling: the linter only emits transformations whose flag equivalence it can justify.

## v0.12 notes

The first deliberately conservative MUL tranche is now implemented:

- `MULS.W/MULU.W #0,Dn -> MOVEQ #0,Dn`
- `MULS.W #1,Dn -> EXT.L Dn`
- `MULU.W #1,Dn` -> explicit zero-extension sequence where ASP68K records a useful timing trade-off
- `MULS.W #2^m,Dn -> EXT.L + ASL.L` for `1 <= m <= 8`, with X/V/C liveness determining whether the suggestion is safe or conditional

Register constant propagation also understands immediate word MULS/MULU, which is useful for later value-dependent optimisations. More elaborate multiply/divide rewrites remain deferred until scratch-register and result/remainder semantics are modelled in enough detail.

## v0.13 additions

The next ASP68K tranche adds:

- `optimization/mulu-word-power-of-two`: zero-extend a word and replace a small power-of-two `MULU.W` with `LSL.L` where the selected CPU targets make the ASP68K trade-off relevant.
- `optimization/muls-word-high-power-of-two`: the `SWAP` / `CLR.W` / `ASR.L` construction for signed word factors `2^m`, `m=9..15`.
- `optimization/negate-sub-to-add` and `optimization/negate-add-to-sub`: collapse `NEG Dn` + arithmetic pairs only when `Dn` is proven dead afterwards. These also conservatively account for CCR observability.

The current rule metadata already uses tags such as `speed`, `size`, and `speed-size-tradeoff`. A future speed-vs-size policy can build on that, but v0.13 does not yet change rule selection based on an optimisation goal.

## Optimization impact metadata

Suggestions carry CPU-scoped `impact` metadata where measurement is available. With `mc68000` selected, replacements are measured through `68kcounter` for encoded bytes, CPU cycles, read bus cycles and write bus cycles. Later processors may omit cycle data or use source/estimated metrics because alignment, pipelines and caches make a single source-level number misleading.

The CLI renders impact when present, for example:

```text
size: 6 → 4 (-2) bytes (exact)
CPU cycles: 12 → 8 (-4) on mc68000 (exact)
read cycles: 3 → 2 (-1) on mc68000 (exact)
write cycles: 0 → 0 (0) on mc68000 (exact)
```

Rule correctness does not depend on impact availability.

### Optimization impact measurements

For a measured MC68000 replacement the execution impact is deliberately split into **CPU cycles**, **read bus cycles**, and **write bus cycles**, plus encoded byte size. `68kcounter` now supplies these measurements automatically. For 68010+ the fields can remain absent (or eventually be marked estimated/source-derived) where alignment, cache and pipeline state make a single exact number misleading.



## v0.17 additions

### Redundant TST detection

`optimization/redundant-tst` is a native m68k-lint rule (not sourced from ASP68K). It detects common patterns such as:

```asm
move.w d0,d1
tst.w  d1
beq    .zero
```

where the producer has already established the condition codes needed for the same data-register result. Logical/data-movement producers are accepted when their CCR result is equivalent to TST; arithmetic/shift producers are only accepted when V/C are proven dead. Labels or other alternate entry points prevent the suggestion.

### Additional ASP68K coverage

v0.17 adds:

- BSET bit 7 -> TAS, including the BEQ/BNE -> BPL/BMI pair forms, with CPU and CCR gating.
- LEA 0.w,An -> SUBA.L An,An on the documented early targets.
- MOVE.L constant synthesis via MOVEQ + NOT.W.
- MOVE.L constant synthesis via MOVEQ + SWAP.

The two constant-synthesis rules derive valid MOVEQ seeds by evaluating the candidate 32-bit sequence, rather than depending on the historical document's range notation.

### Mnemonic canonicalisation

Rules match canonical instruction spellings rather than raw source text. Immediate aliases such as `ADDI`/`ADD`, `SUBI`/`SUB`, `CMPI`/`CMP`, `ANDI`/`AND`, `ORI`/`OR`, and `EORI`/`EOR` are normalised automatically. Condition-code aliases such as `BHS`/`BCC`, `BLO`/`BCS`, and `DBRA`/`DBF` are normalised consistently across control-flow and flag analysis.

Address-register forms (`ADDA`, `SUBA`, `CMPA`, `MOVEA`) are kept semantically distinct by default because their CCR/size behaviour differs; rules which are genuinely valid across both forms opt into the broader instruction-family matcher.

### Operand-sensitive semantic normalization

The linter normalizes assembler spellings before analysis. Source forms such as `ADDI`/`ADD`, `DBRA`/`DBF`, and `BHS`/`BCC` are canonicalized, and operand-sensitive address-register forms are resolved semantically: `MOVE ...,An` -> `MOVEA`, `ADD ...,An` -> `ADDA`, `SUB ...,An` -> `SUBA`, and `CMP ...,An` -> `CMPA`. This keeps CCR/register analysis independent of assembler shorthand.


#### v0.18 semantic-normalisation note

Rules and analyses now operate on the instruction selected by both mnemonic and operands. In particular, generic source spellings with an address-register destination are normalized to `MOVEA`, `ADDA`, `SUBA`, or `CMPA` before CCR/register analysis. Source-level aliases remain available separately for diagnostics and source-preserving rewrites.

### v0.19 coverage additions

- 16..31-bit long ASL/ASR/LSL/LSR replacement sequences, gated by ASP68K's per-CPU timing table and CCR liveness.
- non-zero immediate `MOVEA` to absolute `LEA` on 68000/68010.
- `MOVEA.L Ax,Ay` + immediate `ADDA` folded into `LEA displacement(Ax),Ay` when the displacement fits signed 16-bit range.

The MOVEA/LEA rules operate on the semantic mnemonic, so generic assembler spellings such as `move.l #100,a0` and `add.l #12,a1` are handled the same way as explicit `movea`/`adda` spellings.
- the three ASP68K multi-predecrement cancellation forms (`ADDQ #6/#8,An` followed by two stores), with explicit source-EA dependency checks.


## v0.21 additions

- Added the six ASP68K `ADDQ SP` + `PEA`/predecrement stack-cancellation patterns, with SP-dependency and CCR checks.
- Added `MULS.L/MULU.L #1,Dn` removal for 68060 when CCR observability permits it.
- Marked the historical large-`ASR`-to-zero rows as rejected: arithmetic right shift of a negative value saturates to all ones, not zero.

### v0.21 coverage additions

- Adds selected long constant-multiply recipes with dead scratch-register selection and CCR liveness checks.
- Adds 68060 `MULS.L #0` / small power-of-two replacements.
- Adds selected signed-word constant-multiply recipes (`2,3,5,6,7,9,10,12`).
- Rejects the historical ASP68K `MULS.W #11` recipe because the listed sequence computes 19× the input, not 11×.
- Adds the safe `CMPA.L #0,An -> TST.L An` case for 68030 only.
- Completes the ASP68K manifest audit: all 181 transformation rows are now classified as implemented, partial, deferred, or rejected.

### v0.22 deferred-rule tranche

Two previously deferred areas are now partially implemented:

- `optimization/address-expression-to-lea` folds a full-width address-register copy followed by an immediate adjustment and data-register addition into a single indexed `LEA`. The `.W` MOVEA base-copy spelling is intentionally excluded because it sign-extends the low word rather than preserving the complete base address.
- `optimization/divu-word-power-of-two` recognizes `DIVU.W #2^m,Dn` for valid word divisors (`m=1..15`). Because `DIVU.W` packs the remainder into the upper word and has 16-bit quotient overflow semantics, unknown cases are emitted as manual-review suggestions. If register constant propagation proves that the dividend divides exactly, the quotient fits 16 bits, and differing CCR outputs are dead, the suggestion can be promoted to safe.

Branch shortening and absolute/PC-relative rewrites remain intentionally deferred/skipped: their final displacement cannot be established reliably from source alone, and assemblers such as vasm already optimize common cases.

### v0.23 analysis notes

- `DIVU.W #2^n,Dn` now tracks whether the upper word of `Dn` is actually observed before it is overwritten. If the remainder word is provably discarded, the shift suggestion is upgraded; if it is definitely used, no suggestion is emitted. Quotient-overflow safety remains conservative unless the dividend is known.
- ASP68K rows 847/850 are now rejected as documented optimizations: they save no bytes and are marked slower on 68030/040/060, with 68020 timing unknown.
- ASP68K row 925 is rejected because it contains the invalid form `MOVEQ #n,Az`; MOVEQ cannot target an address register.

## Follow-on source corpus

ASP68K remains the first provenance corpus. A preliminary review of vasm, *68000 Tricks and Traps*, and community/EAB-derived optimization material is recorded in [`docs/source-review.md`](docs/source-review.md). New rules from those sources should carry separate provenance instead of being added to the ASP68K coverage manifest.

## Flamewing audit

`src/coverage-flamewing.ts` tracks the audited subset of Flamewing's M68000 peephole list separately from ASP68K. Flamewing is treated as a candidate corpus rather than ground truth: each row is independently checked for value/CCR/register semantics and encoded-size claims before it becomes a rule. See `docs/flamewing-audit.md`.

### Flamewing coverage additions in 0.27

The Flamewing audit now includes verified register-count logical shifts that collapse to zero, `LSR.B #7` sign-bit extraction, and byte `ASR #7/#8` sign saturation. Stack-assisted shift recipes remain deferred pending an explicit policy for transformations that use SP/memory as scratch state.

### Flamewing coverage additions in 0.28

- verified register-count word shift reductions (`LSL/ASL.W #10..15`, `LSR.W #10..14`) to rotate+mask forms;
- verified register-count long shift reductions for known counts 16..23 using word shifts, `SWAP`, clear, or sign-extension sequences;
- indexed address fold: `ADDA/SUBA.W #disp,An` + `ADDA.{W|L} Xn,An` -> one `LEA`, with 8-bit displacement and register-alias checks.

See `docs/flamewing-audit.md` for the verification notes and policy decisions.

### v0.36 bounded stack-scratch shift suggestions

On `mc68000`, the linter now treats small, bounded SP scratch as a valid optimization technique rather than a reason to defer a rule. `LSL/LSR/ASR.W #8,Dn` and selected known register-count word/long shifts can use Flamewing's A7 stack-alignment sequences. These suggestions are `conditional`: SP is restored exactly and only 2 temporary bytes are required, but the replacement introduces stack memory traffic/bus-fault observability and may have different CCR results. Diagnostics expose `temporaryStackBytes`, `netStackBytes`, `stackPointerRestored`, and `writesStackMemory` metadata.

### Optimization goal

Optimization suggestions can be filtered by intent:

```sh
m68k-lint --goal balanced game.s   # default: show valid suggestions regardless of trade-off
m68k-lint --goal speed game.s      # suppress suggestions known to be slower
m68k-lint --goal size game.s       # suppress known code-size increases / speed-for-size rules
```

The goal filter uses structured impact data when available. Until every rule has measured size/timing data, `size` also uses the `speed-size-tradeoff` rule tag as a conservative fallback. Unknown performance is not silently treated as a regression.

## Exact 68000 optimization impact

When `mc68000` is selected (the default), optimization replacements are measured with
`68kcounter` and diagnostics can include exact encoded bytes, CPU cycles, bus read
cycles, and bus write cycles. Historical source claims remain attached separately
when an exact measurement supersedes them, making discrepancies auditable.

Use `--no-impact` to disable measurement. Measurements are best-effort: unsupported
source spellings and path-dependent instruction timings simply omit the affected
exact metric rather than suppressing the lint diagnostic.

For corpus-level auditing, `--impact-summary` groups exact MC68000 outcomes by
rule and puts measured regressions/trade-offs first. This is useful for finding
historical rules whose stated optimization benefit does not hold for the actual
source forms encountered in a project.

### Audit representative optimization timings

```sh
npm run build
npm run audit:impact
# or: m68k-lint --audit-rule-impact
```

This runs one representative example for every optimization/performance rule. mc68000 cases are measured with `68kcounter`; later-CPU-only rules must carry an explicit audit exemption. Missing cases, examples that no longer trigger, and measured regressions make the command fail.


### v0.39.7 audit refinement

- `combine-consecutive-addq` keeps the combined operation as `ADDQ` when the sum remains in 1..8.
- Rule-impact audit cases may now cover multiple parameter ranges for one rule; output reports cases across rules.


### v0.39.8 audit correction

- Exact mc68000 impact auditing disproved ASP68K's speed claim for combining two ADDQ.L instructions into a full-immediate ADD.L when the sum exceeds 8: the representative case is 2 bytes larger, performs one extra read cycle, and has no CPU-cycle improvement.
- `optimization/combine-consecutive-addq` now suppresses that `sum > 8` branch whenever mc68000 is among the selected targets.
- The measured `sum <= 8` path remains enabled and combines to a single ADDQ.L.
- The source-backed `sum > 8` path remains available for mc68010/mc68030 pending exact target-specific measurement.


### v0.40.0 platform and rule-ID cleanup

- Public rule IDs are source-neutral/descriptive; provenance remains metadata. See `docs/rule-id-migrations.md`.
- Added `--platform generic|amiga` (`generic` is the default).
- Added Amiga-only correctness rules for unsupported `TAS` and a conservative initial set of custom-chip read-only/write-only register accesses.
- `optimization/bset-to-tas` is disabled by default on every platform and is never suggested in Amiga mode, even if explicitly enabled.

## Project discovery and JSON configuration (v0.41)

The CLI accepts explicit files, directories, and glob patterns. Directory and glob discovery recursively includes `.s`, `.asm`, and `.i` files by default:

```sh
m68k-lint src/
m68k-lint "src/**/*.asm"
m68k-lint src/ startup.s
m68k-lint --ext .s,.asm,.i,.inc src/
```

Explicit file paths are always linted even when their suffix is not in the discovery extension list. Duplicate matches from overlapping inputs are de-duplicated.

The CLI searches upward from the current directory for `m68k-lint.json` or `.m68klintrc.json`. Use `--config path/to/config.json` to select one explicitly, or `--no-config` to disable discovery. Configuration uses defaults < config file < CLI precedence; `rules` are merged so a CLI `--rule` only overrides the named rule.

Example `m68k-lint.json`:

```json
{
  "$schema": "./node_modules/m68k-lint/m68k-lint.schema.json",
  "processors": ["mc68000"],
  "platform": "amiga",
  "goal": "balanced",
  "measureImpact": true,
  "extensions": [".s", ".asm", ".i"],
  "files": ["src/**", "include/**"],
  "ignores": ["generated/**", "vendor/**"],
  "categories": {
    "style": false
  },
  "rules": {
    "suspicious/nop": "off",
    "optimization/bset-to-tas": "off"
  }
}
```

`files` is used when no input path is supplied on the command line. File and ignore patterns are relative to the directory containing the config file. `include` and `ignorePatterns` are also accepted as aliases. `node_modules/**` and `.git/**` are ignored during discovery by default.


## Inline configuration comments (v0.42)

Rules can be suppressed directly in assembly comments, using ESLint-style scope directives. Rule IDs remain the same IDs shown by CLI diagnostics and `--list-rules`:

```asm
    ; m68k-lint-disable optimization/prefer-moveq
    move.l  #42,d0
    ; m68k-lint-enable optimization/prefer-moveq

    ; m68k-lint-disable-next-line optimization/prefer-moveq
    move.l  #43,d1

    move.l  #44,d2 ; m68k-lint-disable-line optimization/prefer-moveq
```

Multiple rule IDs may be comma- or whitespace-separated:

```asm
    ; m68k-lint-disable optimization/prefer-moveq, suspicious/self-move
```

A directive with no rule IDs applies to every lint rule. An optional reason may follow `--`:

```asm
    ; m68k-lint-disable-next-line -- hardware-specific timing sequence
    nop
```

`disable` remains active until a matching `enable`; `disable-line` affects the current physical source line and `disable-next-line` affects the immediately following physical source line. Directives are read from semicolon comments in the raw source, independently of the parser AST.

Inline configuration is enabled by default. Projects that require centrally enforced configuration can disable it in JSON:

```json
{
  "inlineConfig": false
}
```

or on the CLI with `--no-inline-config`. `--inline-config` can explicitly re-enable it over project configuration.


## Correctness and suspicious footguns (v0.43)

The default rule set now includes a first general 68k footgun pack in addition to optimization rules:

- `suspicious/zero-sized-storage` flags `DS` declarations whose count resolves to zero. A label on `DS.? 0` aliases the following address, which is often a mistaken `DC` and can make writes corrupt the next object.
- `suspicious/condition-after-preserved-ccr` flags a conditional branch/`Scc`/`DBcc` that intentionally consumes condition codes across an intervening flag-preserving instruction such as `ADDA`, `SUBA`, `MOVEA`, or `LEA`. Cases with unknown/stale CCR remain the stronger `correctness/stale-condition-code` diagnostic.
- `suspicious/movea-word-sign-extension` flags the potentially misleading generic spelling `MOVE.W ...,An`; semantically this is `MOVEA.W`, which sign-extends its source and writes all 32 bits of the address register. Explicit `MOVEA.W` is treated as intentional and stays quiet.
- `suspicious/bit-number-wraparound` catches immediate bit numbers outside their effective range: modulo 32 for data registers and modulo 8 for memory.
- `suspicious/partial-register-write` uses register dataflow to flag `MOVE.B`/`MOVE.W` into a data register when the preserved upper bits are subsequently consumed before a full overwrite.

The linter deliberately does **not** duplicate normal assembler validation. Illegal instruction/size/addressing-mode combinations belong to the parser/assembler unless the linter can add materially better semantic or contextual information. `correctness` is reserved for assembly that is syntactically valid but has a provable semantic/runtime problem; `suspicious` is for valid code that may be intentional but is easy to misread or misuse. Clever CCR-preserving or partial-register idioms can be locally suppressed with the inline directives when intentional.

## Style rules and presets (v0.44)

Style conventions are intentionally opt-in. The normal built-in rule set remains the recommended baseline; subjective formatting/convention checks can be enabled with the `style` preset:

```sh
m68k-lint --preset style src/
```

or in project configuration:

```json
{
  "presets": ["style"]
}
```

The initial semantic style rules are:

- `style/require-instruction-size` — require an explicit size on instructions with multiple operand sizes, e.g. prefer `move.l d0,d1` over `move d0,d1`. Branches are deliberately excluded because omitted branch size is commonly used for assembler relaxation.
- `style/omit-redundant-instruction-size` — omit a size suffix from fixed-size/no-size-field instructions, e.g. prefer `lea foo,a0` over `lea.l foo,a0`.
- `style/prefer-address-register-mnemonics` — prefer explicit `MOVEA`, `ADDA`, `SUBA`, and `CMPA` spellings when the destination selects address-register semantics. This is useful as a reminder of sign-extension and CCR behavior even though the encoded instruction is unchanged.

Those rules are enabled by the `style` preset. More opinionated alias choices are individually opt-in rather than part of the preset:

- `style/prefer-dbra` / `style/prefer-dbf` — choose one spelling for the equivalent DBRA/DBF instruction.
- `style/prefer-unsigned-condition-aliases` — prefer `BHS/BLO`, `DBHS/DBLO`, and `SHS/SLO`.
- `style/prefer-carry-condition-aliases` — prefer `BCC/BCS`, `DBCC/DBCS`, and `SCC/SCS`.

Do not enable both sides of an alias preference at once. Explicit rule settings still take precedence over presets. Formatting-only conventions such as whitespace, alignment, and casing are intentionally left to formatters.

## v0.46.0 Amiga absolute-address footgun

Amiga mode adds `suspicious/unexpected-absolute-address`, aimed at the common 68k typo where an intended immediate constant is written without `#`:

```asm
    move.w $1234,d0       ; suspicious: did you mean #$1234?
    move.w #$1234,d0      ; immediate, no warning
```

The first version deliberately checks only numeric **source** operands on instructions where both an absolute source EA and an immediate source are plausible. It does not warn on absolute destinations or control-flow operands, because those cannot represent the same missing-`#` mistake, and it does not second-guess ordinary symbolic labels.

For `--platform amiga`, the initial expected numeric absolute regions are:

- `$000000-$0000BC` — zero-page exception vectors
- `$DFF000-$DFF1FC` — custom-chip registers

Addresses outside those regions are still valid assembly and may be intentional (for example absolute/`ORG`-based code), so the rule is `suspicious` rather than `correctness`. The range table is exported from `platforms/address-ranges` so platform profiles can be extended independently of the rule.


## v0.46.1 Amiga absolute-address heuristic refinements

- Treats `$BFD000-$BFEFFF` as expected Amiga CIA register space.
- Suppresses `suspicious/unexpected-absolute-address` for any file containing an `ORG` directive, since absolute addressing is then plausibly intentional.

### Amiga custom-register effective addresses

In `--platform amiga`, custom-register direction checks understand common Amiga include-file conventions as well as literal absolute addresses. Canonical custom register names are treated as offsets from `CUSTOM` when their definitions are not visible in the current parsed file, and symbol matching is case-insensitive. For example, both `DMACONR(a6)` after `lea CUSTOM,a6` and `DMACONR+CUSTOM` can be resolved to `$DFF002`. Project-local symbol definitions take precedence over these platform fallbacks.
