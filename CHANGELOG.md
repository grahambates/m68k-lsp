# Changelog

Entries before 0.47.0 were reconstructed from the running version notes that
previously lived in `README.md`.

## Unreleased

### Fixed

- The rule test suite had not been running. Thirteen call sites used
  `result.diagnostics` on a `Diagnostic[]`, which is a compile error, so ts-jest
  skipped the entire 1,326-line file and reported it as a single failure.
  `tsconfig.json` excluded `src/test`, so neither `build` nor `lint` caught it.
- Nearly every rule fixture was written in column-zero form. m68k-parser applies
  real assembler column rules, so `move.l #42,d3` parsed as a label named `move`
  and the rules matched nothing. Fixtures now go through a shared indent helper.
- `normalizeRuleImpactAuditSource` claimed colon-terminated labels survive
  indentation. They do not: an indented `.loop:` parses as neither a label nor a
  mnemonic, so branch targets silently vanished from audit fixtures. Column-zero
  label definitions are now left in place.
- `optimization/redundant-zero-displacement` emitted a bare operand fragment,
  `(a0)`, as its suggestion replacement. Every other rule emits a full line, and
  impact measurement assumes that, so it was comparing a whole source line
  against a fragment. It now rewrites the operand within the full line and
  measures as the 2-byte saving ASP68K claims.
- `dataRegisterBitsUseAfter` propagated its bit mask but never transformed it,
  and `SWAP` has no size so the walker bailed to `unknown`. SWAP relocates the
  tracked bits, so the rotated mask is now followed. A DIVU.W remainder read via
  `swap dn` / `move.l dn,...` is correctly seen as a use, and
  `optimization/divu-word-power-of-two` no longer suggests a shift that would
  discard it.
- Diagnostics are sorted by source position. Rules run in registration order, so
  output was previously grouped by rule rather than in reading order.
- Inline directives are recognised in column-zero `*` comments, the standard
  full-line comment in Devpac, AsmOne and vasm. Previously only `;` was read, so
  `* m68k-lint-disable ...` was silently ignored.
- CLI caret pointers line up on tab-indented source.
- ASP68K coverage reported "138/181 rows implemented; 182 rows tracked". The
  v0.8 row count was low by one; corrected to 182.
- The `--audit-rule-impact` exit code now treats `unmeasured` as a failure,
  matching the documented policy and the test. The two tail-call rules, which
  deliberately emit no replacement text, are explicitly exempt instead.

### Removed

- **Breaking:** the `performance` rule category. It never had any rules, and
  nothing belonged in it: branch collapsing and redundant reloads are ordinary
  `optimization` substitutions. It is gone from `RuleCategory`, the CLI `--only`
  and `--disable-category` lists, the JSON schema, the config loader and the
  impact-measurement paths. A config setting `categories.performance` now errors
  rather than being silently ignored. See [`docs/rule-roadmap.md`](docs/rule-roadmap.md).

### Added

- `optimization/prefer-lea-for-address-symbol` — `move.l #label,a0` becomes
  `lea label,a0`. The two are identical in size and cycles as written, and the
  audit measures exactly that (neutral, all deltas zero). The gain is at
  assembly time: LEA lets the assembler relax the operand to PC-relative where
  the target is in range, 2 bytes shorter and faster, which a long immediate
  MOVEA can never be. The suggestion deliberately carries no size suffix, since
  an explicit `.L` would pin it to absolute long and defeat that. Foldable
  constants are left to `optimization/movea-immediate-to-lea` so the two do not
  double-report.
- CI running typecheck, tests, build and the rule impact audit.
- `npm run docs:rules` regenerates [`docs/rules.md`](docs/rules.md) from the
  built rule set.
- `tsconfig.build.json`, so `lint` typechecks tests while `build` keeps them out
  of the published `dist`.

### Changed

- `README.md` is now a reference document; version history moved here.

## 0.46.1

- Treats `$BFD000-$BFEFFF` as expected Amiga CIA register space.
- Suppresses `suspicious/unexpected-absolute-address` for any file containing an
  `ORG` directive, since absolute addressing is then plausibly intentional.
- Amiga custom-register direction checks understand common include-file
  conventions: canonical register names are treated as offsets from `CUSTOM`
  when their definitions are not visible, and symbol matching is
  case-insensitive. Both `DMACONR(a6)` after `lea CUSTOM,a6` and
  `DMACONR+CUSTOM` resolve to `$DFF002`. Project-local definitions win.

## 0.46.0

- Added `suspicious/unexpected-absolute-address` for Amiga mode, aimed at the
  common typo where an intended immediate is written without `#`. It checks only
  numeric source operands where both an absolute EA and an immediate are
  plausible, and does not second-guess symbolic labels.
- Expected numeric absolute regions: `$000000-$0000BC` (exception vectors) and
  `$DFF000-$DFF1FC` (custom chip registers). The table is exported from
  `platforms/address-ranges`.

## 0.44

- Style rules, opt-in via the `style` preset: `style/require-instruction-size`,
  `style/omit-redundant-instruction-size`,
  `style/prefer-address-register-mnemonics`.
- Individually opt-in alias preferences: `style/prefer-dbra` / `style/prefer-dbf`,
  `style/prefer-unsigned-condition-aliases`,
  `style/prefer-carry-condition-aliases`. Do not enable both sides at once.
- Formatting-only conventions (whitespace, alignment, casing) are intentionally
  left to formatters.

## 0.43

First general 68k footgun pack:

- `suspicious/zero-sized-storage` — a label on `DS.? 0` aliases the following
  address, often a mistaken `DC`.
- `suspicious/condition-after-preserved-ccr` — a conditional consuming condition
  codes across an intervening flag-preserving `ADDA`/`SUBA`/`MOVEA`/`LEA`.
- `suspicious/movea-word-sign-extension` — the misleading generic `MOVE.W ...,An`
  spelling; explicit `MOVEA.W` stays quiet.
- `suspicious/bit-number-wraparound` — immediate bit numbers outside their
  effective range (mod 32 for data registers, mod 8 for memory).
- `suspicious/partial-register-write` — `MOVE.B`/`MOVE.W` into a data register
  when the preserved upper bits are later consumed before a full overwrite.

## 0.42

- Inline configuration comments with ESLint-style scope directives:
  `m68k-lint-disable`, `-enable`, `-disable-line`, `-disable-next-line`.
- Multiple rule IDs may be comma- or whitespace-separated; a directive with no
  IDs applies to every rule; an optional reason may follow `--`.
- Disable centrally with `"inlineConfig": false` or `--no-inline-config`.

## 0.41

- The CLI accepts files, directories and glob patterns, recursively discovering
  `.s`, `.asm` and `.i` by default. Explicit paths are always linted.
- Project configuration discovery: `m68k-lint.json` or `.m68klintrc.json`,
  searched upward. `--config` selects one; `--no-config` disables discovery.
- Precedence is defaults < config file < CLI, with `rules` merged so a CLI
  `--rule` overrides only the named rule.
- `include` and `ignorePatterns` accepted as aliases of `files` and `ignores`.

## 0.40.0

- Public rule IDs are source-neutral and descriptive; provenance moved to rule
  metadata. See [`docs/rule-id-migrations.md`](docs/rule-id-migrations.md).
- Added `--platform generic|amiga`.
- Amiga-only correctness rules for unsupported `TAS` and custom-chip register
  access direction.
- `optimization/bset-to-tas` is off by default on every platform, and is never
  suggested in Amiga mode even if explicitly enabled.

## 0.39.8

- Exact mc68000 auditing disproved ASP68K's speed claim for combining two
  `ADDQ.L` into a full-immediate `ADD.L` when the sum exceeds 8: the
  representative case is 2 bytes larger, performs one extra read cycle, and has
  no CPU-cycle improvement. That branch is suppressed when mc68000 is targeted.
- The measured `sum <= 8` path still combines to a single `ADDQ.L`. The
  source-backed `sum > 8` path remains for mc68010/mc68030.

## 0.39.7

- `combine-consecutive-addq` keeps the combined operation as `ADDQ` when the sum
  remains in 1..8.
- Audit cases may cover multiple parameter ranges for one rule.

## 0.37

- vasm-derived logical identity and multiply rules; optimization goal filtering
  applied to speed-for-size rules.

## 0.36

- On mc68000, small bounded SP scratch is treated as a valid optimization
  technique. `LSL/LSR/ASR.W #8,Dn` and selected known register-count shifts can
  use Flamewing's A7 stack-alignment sequences.
- These are `conditional`: SP is restored exactly and only 2 temporary bytes are
  needed, but the replacement introduces stack memory traffic and bus-fault
  observability, and CCR results may differ. Diagnostics expose
  `temporaryStackBytes`, `netStackBytes`, `stackPointerRestored` and
  `writesStackMemory`.
- Added the `--goal balanced|speed|size` filter.

## 0.30 – 0.32

- Flamewing partial-register tranche, arithmetic-shift tranche, and unsigned
  low-word multiply recipes.

## 0.27 – 0.28

- Verified register-count logical shifts collapsing to zero, `LSR.B #7` sign-bit
  extraction, byte `ASR #7/#8` sign saturation.
- Register-count word shift reductions (`LSL/ASL.W #10..15`, `LSR.W #10..14`) to
  rotate+mask forms, and long shift reductions for counts 16..23.
- Indexed address fold: `ADDA/SUBA.W #disp,An` + `ADDA.{W|L} Xn,An` -> one `LEA`.

## 0.26

- Started the Flamewing audit, tracked in `src/coverage-flamewing.ts` separately
  from ASP68K. Flamewing is treated as a candidate corpus, not ground truth:
  each row is independently checked before it becomes a rule. See
  [`docs/flamewing-audit.md`](docs/flamewing-audit.md).

## 0.23

- `DIVU.W #2^n,Dn` tracks whether the upper word is actually observed before
  being overwritten.
- ASP68K rows 847/850 rejected: no bytes saved and marked slower on
  68030/040/060.
- ASP68K row 925 rejected: it contains `MOVEQ #n,Az`, and MOVEQ cannot target an
  address register.

## 0.22

- `optimization/address-expression-to-lea` folds a full-width address-register
  copy plus immediate adjustment plus data-register addition into one indexed
  `LEA`. The `.W` MOVEA base-copy spelling is excluded because it sign-extends.
- `optimization/divu-word-power-of-two` for valid word divisors, emitted as
  manual-review unless the remainder is provably discarded.
- Branch shortening and absolute/PC-relative rewrites remain deferred: final
  displacement cannot be established from source alone.

## 0.21

- Six ASP68K `ADDQ SP` + `PEA`/predecrement stack-cancellation patterns.
- `MULS.L/MULU.L #1,Dn` removal for 68060.
- Long constant-multiply recipes with dead scratch-register selection.
- Signed-word constant-multiply recipes (2, 3, 5, 6, 7, 9, 10, 12).
- Rejected the ASP68K `MULS.W #11` recipe: the listed sequence computes 19x.
- `CMPA.L #0,An -> TST.L An` for 68030 only.
- Rejected the large-`ASR`-to-zero rows: arithmetic right shift of a negative
  value saturates to all ones, not zero.
- Completed the ASP68K manifest audit; every transformation row classified.

## 0.19

- 16..31-bit long ASL/ASR/LSL/LSR replacement sequences, gated by ASP68K's
  per-CPU timing table and CCR liveness.
- Non-zero immediate `MOVEA` to absolute `LEA` on 68000/68010.
- `MOVEA.L Ax,Ay` + immediate `ADDA` folded into `LEA displacement(Ax),Ay`.
- The three ASP68K multi-predecrement cancellation forms.

## 0.18

- Rules and analyses operate on the instruction selected by both mnemonic and
  operands. Generic spellings with an address-register destination normalize to
  `MOVEA`, `ADDA`, `SUBA` or `CMPA` before CCR/register analysis.

## 0.17

- `optimization/redundant-tst`, a native rule. Logical/data-movement producers
  are accepted when their CCR result is equivalent to TST; arithmetic/shift
  producers only when V/C are proven dead. Alternate entry points prevent it.
- BSET bit 7 -> TAS including the BEQ/BNE -> BPL/BMI pair forms.
- `LEA 0.w,An -> SUBA.L An,An` on the documented early targets.
- MOVE.L constant synthesis via MOVEQ + NOT.W and MOVEQ + SWAP.
- Mnemonic canonicalisation for immediate and condition-code aliases.

## 0.13

- `optimization/mulu-word-power-of-two`,
  `optimization/muls-word-high-power-of-two`.
- `optimization/negate-sub-to-add` and `optimization/negate-add-to-sub`, only
  when the negated register is proven dead afterwards.

## 0.12

- First conservative MUL tranche: `MULS.W/MULU.W #0`, `MULS.W #1`, `MULU.W #1`,
  and `MULS.W #2^m` for 1 <= m <= 8 with X/V/C liveness deciding applicability.
- Register constant propagation understands immediate word MULS/MULU.

## 0.11

- Models MOVEM register-list reads/writes so MOVEM is not opaque to liveness.
- Propagates constants through more immediate arithmetic, logical operations,
  NOT/NEG/SWAP/EXT and long shifts.
- `optimization/cmp-zero-address-via-scratch` for the conservative `.L` form.
- `optimization/combine-consecutive-addq` with per-flag CCR safety.

## 0.10

- Conservative general-purpose register analysis: per-register liveness,
  definite constants, constant/copy propagation, knowledge loss at calls and CFG
  joins, and dead data-register discovery for scratch-register optimisations.
- First rules using it: `optimization/known-zero-clear`,
  `optimization/move-immediate-via-scratch`.

## 0.9

- Machine-readable ASP68K coverage manifest and `--asp68k-coverage`.
- `optimization/redundant-zero-displacement`, `address-add-to-lea`,
  `address-sub-to-lea`, `push-immediate-pea`, `single-register-movem`,
  `bset-low-word-mask`, `bclr-low-word-mask`, `shift-two-adds`.
- Tightened `optimization/prefer-tst-zero` for address-register forms.

## 0.8

- `optimization/btst-sign-branch`, `combine-adjacent-clr-bytes` / `-words`,
  `combine-adjacent-move-bytes` / `-words`.
- Wider-memory-access rules are intentionally manual even when addresses are
  provably adjacent: two narrow accesses are not universally interchangeable
  with one wider bus access for memory-mapped I/O or fault boundaries.

## 0.7

- `optimization/prefer-moveq-zero`, `prefer-st-minus-one`,
  `prefer-add-for-shift-one`, `prefer-move-word-address`,
  `zero-address-register`, `addq-address-word-size`, `subq-address-word-size`,
  `prefer-link-sequence`, `prefer-unlk-sequence`.

## 0.6

- Dependency-free CLI, exposed as the `m68k-lint` executable.
- Parser errors and `error`-severity diagnostics exit 1; `--fail-on` makes CI
  stricter; usage errors exit 2.

## 0.5

- `optimization/prefer-lea-quick`, `jsr-rts-tail-call`, `bsr-rts-tail-call`,
  `push-address-pea`.
- Tail-call rules are deliberately manual: ASP68K notes the different stack
  depth, which can be observable to the callee.

## 0.4

- `optimization/prefer-subq`, `prefer-subq-negative-add`,
  `prefer-addq-negative-sub`, `prefer-tst-zero`, `prefer-not`, `prefer-bset`,
  `prefer-bclr`, `shift-to-clear`.
- Established the pattern of promoting a suggestion from conditional to safe
  when the relevant flags are proven dead.
