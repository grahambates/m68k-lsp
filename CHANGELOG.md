# Changelog

Entries before 0.47.0 were reconstructed from the running version notes that
previously lived in `README.md`.

## Unreleased

### Changed

- `optimization/redundant-zero-displacement` is off by default, available under
  the `style` preset. vasm and other optimising assemblers encode `0(a0)` and
  `(a0)` identically, so the measured saving is in the written form rather than
  the output. What is left is a preference about how the source reads, and a
  zero displacement is sometimes written deliberately to line up with the
  non-zero cases around it.

### Fixed

- DIVU.W and DIVS.W are recorded as reading a 32-bit dividend. The `.w` names
  the divisor and the quotient, not the operand taken from the register, but the
  read was modelled at the operand's width. Dividing after setting only the low
  word is the classic way to get a wrong answer, and it went unreported.
  MULU.W and MULS.W do read only the low word, and were already right.
- `suspicious/partial-register-write` no longer treats an instruction that
  consumes the register as establishing it. A divide writes all 32 bits, but it
  read them first, so it does not account for what was above the word that was
  set — counting it excused exactly the bug above. A SWAP still counts, being
  how the upper half is addressed at all.

### Changed

- `suspicious/partial-register-write` reports only where the routine never
  writes the register whole. Building a long out of its halves — a word into the
  low half, a SWAP, a word into the other — makes every write in the sequence
  partial, so each looked like it had inherited whatever was above it and the
  rule fired throughout ordinary source. A MOVE.L, CLR.L, MOVEQ or SWAP anywhere
  between the surrounding non-local labels shows the halves are being managed
  deliberately. What remains is the case the rule was for: upper bits that are
  read but never established, so they hold whatever was there on entry.

### Fixed

- Findings from different files are separated by two blank lines rather than
  one newline. Each file was printed with its own call, which put a blank line
  between findings within a file and nothing at the boundary between two, so the
  last finding of one ran straight into the first of the next.

### Added

- `-i` / `--fix-interactive` reviews findings one at a time, showing each as it
  would be reported and asking what to do. Two things vary: whether the answer
  covers one finding (`y`, `n`) or every remaining finding of its rule (`Y`,
  `N`), and whether it lasts for this run or is written down — `a` adds a
  directive beside the code, `d` writes the rule off in `m68k-lint.json`. Allowing writes a
  `m68k-lint-disable-next-line` directive beside the code; disabling writes the
  rule off in `m68k-lint.json`, preserving anything already there, and the
  session stops asking about it. Both are the useful answers for a finding with
  no rewrite, where the question is whether the code is meant to be that way
  rather than how to change it. Questions come in file order; edits are made
  afterwards from the bottom up.

### Changed

- `--fix` applies only measured improvements by default. Applicability and
  outcome answer different questions: `safe` says a rewrite means the same
  thing, not that it is worth making. A trade-off becomes applicable under
  `--goal speed` or `--goal size`, where the goal filter has already dropped the
  ones that hurt the chosen resource; under `balanced` it is a decision the
  linter should not take. A neutral rewrite is never applied. Suggestions with
  no measurement, such as removing a dead write, stay eligible.

### Added

- `--fix-annotate` keeps the original above a rewrite that is hard to read back,
  commented out and delimited. Triggered by either of two measurable signals:
  the replacement has more lines than what it replaces, or it dropped a name the
  result no longer mentions. Ordinary one-for-one rewrites are left plain. A
  label sharing the replaced line stays live on the replacement rather than
  being commented out with it.

### Added

- `--fix` rewrites files in place, applying `safe` suggestions until nothing
  more changes. `--fix-conditional` also applies `conditional` ones, whose notes
  state the assumption each rests on, and `--fix-dry-run` reports what would
  change without writing. Fixes apply from the bottom up so earlier line numbers
  stay valid, overlapping ones are left for the next round, and rounds repeat
  because one rewrite exposes another. A round whose result no longer parses is
  rolled back and the run stops.

### Changed

- Bit masks are written as a shift of the bit number: `bset #2,d3` suggests
  `or.w #1<<2,d3` rather than `or.w #$0004,d3`, and BCLR takes the complement,
  `and.w #~(1<<2),d3`. The mask says which bit is meant, and a symbolic bit
  number survives instead of collapsing into a hex constant.
- Two other rules write their arithmetic out rather than its result where a name
  would otherwise be lost: `optimization/combine-consecutive-addq` gives
  `addq.l #SMALL+2,d0`, and `optimization/move-immediate-double-byte` gives
  `moveq #BYTES/2,d0`. Only where there is a name to keep — `#3+2` reads worse
  than `#5` and preserves nothing.

### Fixed

- A rule no longer matches a run of instructions across a block directive. The
  tail-call rule paired a BSR inside an IFNE arm with the RTS after the ENDC and
  offered a BRA covering all three lines, deleting the ENDC so the file stopped
  assembling. The same lexical scan would pair a BSR in one arm with an RTS in
  the other, which never run together at all. The search for an adjacent
  instruction now stops at a conditional, REPT or macro boundary, as it already
  did at a macro invocation, so every sequence rule is covered. A span
  containing any directive is refused outright as a second line of defence,
  which also stops a replacement swallowing an alignment directive.

### Fixed

- A goal no longer hides a rewrite that is free on the axis it cares about.
  `serves` gated the whole rule, so a rule that usually costs bytes was off in
  every size-focused run even on inputs where it costs none: `muls.w #2` saves
  34 cycles for no extra bytes and was hidden, while `muls.w #10` costs 6 and
  should be. Cost is a property of the instance, not the rule, so where figures
  exist they decide per suggestion and the declaration is the fallback for when
  they do not. Inverse pairs stay gated either way, since both halves running
  would let each recreate the other's input.

### Fixed

- A replacement no longer discards the trailing comment on the code it
  replaces. `move.l #100,d0 ; how many faces` becoming `moveq #100,d0` lost the
  only record of what the value was for. The comment is carried across with the
  spacing the author chose, and where one instruction becomes several it goes on
  the first line, which is the operation it described. Where several lines
  collapse into fewer, comments with no line left to sit beside are kept on
  their own, indented to match, rather than dropped.

### Fixed

- A replacement no longer destroys a label on the code it replaces.
  `start: move.l #100,d0` becoming `moveq #100,d0` was a `safe` suggestion that
  deleted `start:`, and with it every branch to it. A label on the first matched
  line is carried across, since it still points at the same instruction, and
  deleting a labelled instruction leaves the label behind on its own line. A
  label further into a match makes the finding `manual` with no rewrite: a run
  collapsing to fewer lines leaves nowhere for a label that pointed into the
  middle of it. Handled centrally, so no rule can forget.

### Added

- A diagnostic says when its replacement works out a value rather than carrying
  it. Rules that copy a value through keep the symbol, so the code still tracks
  the constant; rules that derive one write the arithmetic result and the name
  disappears. `muls.w #SCALE,d0` becomes `asl.l #3,d0`, which is silently wrong
  the moment SCALE changes, and nothing in the code says so. Deleting code is
  not reported, since it drops every name in it by design.

### Added

- `optimization/adds-to-shift`, the inverse of `optimization/shift-two-adds`:
  a register doubled twice is a two-bit left shift, two bytes smaller and two
  cycles slower. It runs only in size-focused runs.
- Rules may declare `serves: "speed" | "size"` for a rewrite that trades one
  resource for the other, and `inverseOf` for one that undoes another. A rule
  that serves a goal is off under the other goal, and an inverse is off in
  balanced runs, so a pair can never both be live. Without that, each would
  recreate the other's input and a fixer applying safe rewrites to a fixpoint
  would not terminate. Tests check the declaration against the audit and check
  that no two live rules undo each other under any goal.

### Changed

- `serves` replaces the `speed-size-tradeoff` tag, which did the same job for
  one goal only and was not checked against anything.

### Changed

- The `speed` and `size` tags are gone. `--goal speed` and `--goal size` filter
  on measured impact, and nothing read those tags; they were hand-written
  provenance that disagreed with the measurements in 49 places, including 41
  rules that save cycles without being tagged `speed`.
- `speed-size-tradeoff` stays, because it is the fallback where impact cannot be
  measured: 68kcounter covers the 68000 only, and measurement can be turned off.
  Six rules spelled it `size-tradeoff`, which the filter never matched, and
  seven measured size-costing rules carried no tag at all. Both are fixed, and a
  test now checks the tag against the audit so the two cannot drift apart again.

### Fixed

- Rotate rules have their cycle saving measured. A rotate by a register has the
  same `base + multiplier * n` timing as a shift and fires only once the count
  is proven, but recorded it as `rotateCount` where the resolver looked only for
  `shiftCount`, so `optimization/known-register-rotate` measured as an
  unresolved range. It saves 20 cycles.
- `optimization/prefer-bset` reports the 2 bytes it saves. BSET on a data
  register is always long, so the `.l` the rule writes adds nothing the encoding
  does not already fix — yacht.txt gives `#<data>,Dn .L` as `10(2/0)`, two word
  fetches — but 68kcounter bills the spelled-out form an extra extension word,
  inconsistently, since it sizes `bclr.l` correctly. The measurement copy now
  drops a redundant size on a bit instruction; the suggestion keeps its
  spelling.

### Changed

- Diagnostics carry the run of source lines they cover, as `span`. A rule that
  matches a sequence replaces all of it — BSR followed by RTS becomes one BRA —
  and the extent was previously reconstructed inside the impact module by
  reading `data` key names, so it existed only where measurement had run.
  Anything applying a replacement needs it unconditionally.
- The CLI shows every line of a match rather than only the first, and no longer
  draws a caret under it. All but one rule points at a mnemonic, so the
  underline never said more than "this instruction", and under a multi-line
  match it marked one line as though the rest were context.
- Syntax errors are no longer reported, counted, or treated as a failed run.
  Syntax belongs to the assembler, which judges it against its own grammar;
  this parser is deliberately more permissive, so a line it cannot read may be
  valid to yours, and it is built to recover so that analysis can continue
  while a file is mid-edit. A file that does not fully parse is noted once, so
  an empty result is not mistaken for a verified one. The detail remains in
  `--format json` for tooling that wants it.

### Changed

- Rules offer a rewrite wherever one exists. `manual` now means there is no
  single mechanical replacement to give, not that applying one needs thought.
  Several rules produced replacement text and then marked it `manual`, which
  showed a rewrite while declaring none existed; and the tail-call rules
  withheld the text entirely. `optimization/bsr-rts-tail-call` and
  `optimization/jsr-rts-tail-call` now supply `BRA`/`JMP` as a conditional
  suggestion, with the stack-depth requirement stated. Also moved from `manual`
  to `conditional`: the adjacent CLR and MOVE combinations, `jsr-jmp-tail-dispatch`,
  the memory form of the logical-identity TST rules, and DIVU power-of-two where
  the packed remainder's use is unproven.
- The tail-call rules are measured by the impact audit, which they could not be
  while they offered nothing to measure. Both save 2 bytes and 24 cycles.

### Fixed

- The tail-call rules detect a label anywhere in the matched pair, not only one
  sharing the RTS line. A label on its own line above the RTS marks the same
  externally reachable entry point.

### Fixed

- CMPA is recorded as setting the condition codes. It was grouped with MOVEA,
  ADDA and SUBA as an address-register operation that leaves CCR alone, but it
  writes no register at all and, like every compare, sets N, Z, V and C from the
  subtraction while preserving X. An ordinary `cmpa.l a2,a0` followed by `beq`
  was reported by `suspicious/condition-after-preserved-ccr` as a branch reading
  a condition nothing had set.

### Fixed

- Conditional assembly arms are modelled as alternatives rather than a
  sequence. Exactly one arm is assembled, but IF/ELSE/ENDC were treated as
  ordinary skipped directives, so the first arm ran into the second and a write
  in one looked overwritten by the other:

  ```
      ifne    SHADOW_ON
      moveq   #7-1,d7     <- reported dead
      else
      moveq   #8-1,d7
      endc
  ```

  The code above a block now reaches each arm and each arm reaches the code
  below, with none reaching another. A block with no ELSE also reaches the code
  below directly, since the condition may be false. Nesting, ELSEIF and ENDIF
  are handled. A write that every arm overwrites, or one dead within a single
  arm, is still reported.

### Changed

- `suspicious/movea-word-sign-extension` reports only where the sign-extended
  upper half is read again. Holding a 16-bit value in a spare address register
  when data registers run short is ordinary, and reading it back with MOVE.W is
  unaffected by the extension, so flagging every word load buried the case that
  is actually wrong. It now fires when the register is used as a base address,
  or read at full width, and stays quiet when only the low word is read, when
  the register is fully overwritten first, or when it is never used again.
- The same rule no longer depends on the spelling. It previously fired only on
  the generic `move.w <ea>,An` and ignored an explicit `movea.w`, which are the
  same instruction; source normalised to `movea.w` was never checked at all.

### Fixed

- Bit-level register liveness covers address registers, not just data
  registers. Using one as a base address reads all 32 bits, which is what makes
  a sign-extended upper half observable. Arithmetic that reads an address
  register and writes it back passes the question through rather than answering
  it: the upper half of an ADDA result comes from the upper half that went in,
  and its low half cannot depend on the half above.

### Fixed

- Impact is measured on the values operand expressions evaluate to, not on how
  they are spelled. 68kcounter reads the written form to choose an addressing
  mode, and a compound displacement defeats that: `lea SCREEN_BW/2+(SCREEN_H/2*SCREEN_BW)(a3),a3`
  measured 6 bytes and 12 cycles where `lea 1610(a3),a3` measures 4 and 8, so
  keeping the source's symbols in a replacement turned a cycle saving into a
  reported regression. Suggestions still show the symbols; only the copy handed
  to the counter is collapsed. Parentheses alone were enough to trigger it, so
  purely numeric expressions were affected too. Absolute addresses are left
  alone, since substituting one would change which absolute form is chosen and a
  branch target is not the measurement's to rewrite.

### Fixed

- `suspicious/dead-register-write` no longer reports instructions whose result
  survives in bits a later narrow write leaves alone. Liveness treated every
  write as ending a register's life, but a byte or word operation on a data
  register preserves the bits above it, so `swap d7` / `move.w d4,d7` /
  `swap d7` looked like the first SWAP did nothing. Narrow writes are now
  tracked as partial; MOVEA, MOVEM.W and the word multiplies and divides are
  excluded, since they write the whole register despite a narrow size.
- EXT and EXTB are recorded as reading the value they extend. They were grouped
  with CLR, which does overwrite without reading, so whatever fed an EXT looked
  dead.
- Rules matching a shift by a register now have their cycle cost measured. The
  timing is a range only because the count is unknown in general, and these
  rules fire only once the count is proven, so it is substituted into the
  calculation 68kcounter already supplies. Four rules that save cycles at a cost
  in bytes were reported as outright regressions with no timing at all; they now
  measure between 2 and 36 cycles saved and read as trade-offs. A range with no
  count behind it, such as a conditional branch, stays unmeasured.

### Added

- Syntax highlighting for the assembly in terminal output, covering both the
  source line a diagnostic points at and the suggested replacement. Mnemonics
  and their size qualifiers, registers, literals in any base, strings,
  punctuation and comments each get a colour; symbols and labels are left plain
  so the names carrying the meaning stay the most readable thing on the line.
  Structure comes from the parser, which already knows where each part of a line
  begins and ends; only the inside of an operand is tokenised, since that is the
  one split the parser does not provide.
  Colour is off when output is piped, and adds no visible width, so the caret
  underlining a diagnostic stays aligned.

### Fixed

- `format.test.ts` still asserted the two-space prefix that CLI formatting
  improvements removed from `formatImpact`.

### Changed

- Suggested replacements adopt the layout of the code they replace: the
  indentation on every line, and the column the operands start in. Rules emit a
  single space between mnemonic and operands, so a replacement previously sat
  out of line with its neighbours even once indented. Where the source separates
  with tabs the replacement does too, which keeps the columns together whatever
  width tabs are rendered at; where it aligns with spaces, the column is matched
  in spaces. A single space is left alone, being a separator rather than an
  alignment. Rules emit compact text starting in column zero, which is not
  valid assembly: a token in column zero is a label, so a multi-line
  replacement pasted as written defined a label per line. Whatever the source
  uses is matched, tabs or spaces and at whatever width, and a label sharing the
  line does not defeat it, since the instruction's indentation is then the gap
  between label and mnemonic. The CLI prints a multi-line replacement as a block
  so that indentation survives to the terminal.

### Changed

- Suggested replacements keep the expression the source wrote instead of the
  number it evaluates to. `adda.w #SCREEN_BW/2+(SCREEN_H/2*SCREEN_BW),a3` now
  suggests `lea SCREEN_BW/2+(SCREEN_H/2*SCREEN_BW)(a3),a3` rather than
  `lea 1610(a3),a3`. Substituting the value produced a correct instruction and a
  bad edit: it discarded the name saying what the number meant, and froze a
  value that was supposed to follow the constant when it changed. The base a
  literal was written in is kept too, so a `$3f` mask stays hexadecimal.
  Applies to the fifteen rules that carry a value through unchanged; rules
  emitting a value they derived, such as a shift count from a multiplier, still
  write a number, because there is no symbol to keep. Where a rule has to negate
  the value, as SUB becoming LEA does, a bare symbol is negated in place and
  anything compound is wrapped: `-(SCREEN_BW/2+8)`, since unary minus binds
  tighter than the operators inside it.

### Added

- Constants are resolved across the project. Files are linted one at a time, so
  a name an include defines was simply unknown, and roughly three quarters of
  the rules depend on resolving constants. Every assembly and header file under
  the project is now indexed, which sidesteps needing the entry point and the
  assembler's include paths to rebuild the real include hierarchy. The index is
  monotonic by construction: it answers only for a name the whole project agrees
  on, so it can turn "unknown" into "known" but never "known" into "wrong".
  Conflicting definitions — a debug and a release configuration, per-machine
  headers — leave the name unknown as before. Disable with
  `"projectSymbols": false`.
- Diagnostics name the file a borrowed constant came from, since a value taken
  from a header the linter merely found is the likeliest thing to be wrong about
  a report.

### Fixed

- The symbol table no longer guesses. Two different definitions of one name
  resolved to whichever came last, though which is in force depends on assembly
  order and conditional arms that cannot be evaluated; they now resolve to
  unknown. A definition repeated identically, as happens when a header is
  included twice, is still not a conflict, and the include-guard idiom that
  wraps most real constants in a conditional still resolves.
- Constants defined inside a macro body are no longer treated as file-global.
  They belong to an expansion, may not exist until the macro is invoked, and may
  differ between invocations.
- The CLI indexes the directory being linted rather than the working directory
  when no config file marks the project root.

### Fixed

- Macro invocations are no longer invisible to the analysis. The parser types a
  macro call `mnemonic.type === "macro"`, which fell through every
  `type === "instruction"` filter, so a call was modelled as a no-op that reads
  no registers. `suspicious/dead-register-write` therefore reported writes the
  macro went on to read, and sequence rules fused instructions across a call —
  `optimization/prefer-link-sequence` would collapse a frame setup around an
  intervening macro and offer a replacement that deleted it. A call is now an
  opaque node: its operands count as reads, everything else is unknown, and the
  adjacent-instruction search stops at one.
- Macro definition bodies no longer join the flow of the code around them. The
  instructions between MACRO and ENDM run where the macro is invoked, not where
  it is written, so each definition is its own region that flow neither enters
  nor leaves. The body is still analysed — a write it overwrites before reading
  is dead in every expansion — but its last line escapes rather than being
  treated as the end of the program.
- REPT bodies are analysed as loops. Without a back edge from the last line of
  the body to the first, a value written late in an iteration and read early in
  the next looked dead, where the equivalent DBF loop was correctly quiet.

### Added

- `npm run verify:semantics`, a differential checker that runs each audit case
  and its replacement on an m68k interpreter and compares every register and
  condition-code bit. It exists because the impact audit proved replacements
  were cheaper and nothing proved they were equivalent. It is a bug finder, not
  a prover, and does not gate CI: the interpreter is a teaching tool whose
  documentation disclaims full accuracy, so it is calibrated against 29
  documented 68000 behaviours first, and a difference means a rule and an
  interpreter disagree. See
  [`docs/differential-checker.md`](docs/differential-checker.md).

### Fixed

- `optimization/prefer-link-sequence` claimed `applicability: "safe"` with no
  flag check. LINK sets no condition codes, while the `MOVE.L a6,-(SP)` opening
  the sequence it replaces sets N and Z and clears V and C. It is now `safe`
  only where those four are dead, and `conditional` otherwise.
- `optimization/quick-negative` claimed `applicability: "safe"` with no flag
  check. ADD sets C on a carry out where SUB sets it on a borrow, so the two
  forms leave opposite C and X for the same operands.
- `optimization/negate-add-power-of-two-to-eor` was off by one and is renamed
  `optimization/negate-add-mask-to-eor`. XOR by a mask `m` maps `x` to `m-x`, so
  the identity pairs with `ADD #m`, not with the next power of two: `neg` then
  `add #8` of 3 is 5, where `eor #7` of 3 is 4. The rule matched the power of
  two and emitted the mask, producing a result one too low. It now matches the
  mask. See [`docs/rule-id-migrations.md`](docs/rule-id-migrations.md).

### Changed

- `stale-condition-code` moved from `correctness` to `suspicious`. It fires
  when no concrete definition of the tested flag can be shown to reach the
  conditional, which usually means the producer is in another file or the
  routine is entered from elsewhere: an analysis limitation, not a proven
  fault. Relying on the CCR surviving across address arithmetic is also a
  deliberate technique. Its sibling `condition-after-preserved-ccr` already
  covers the provable case, so the less certain rule was carrying the stronger
  category. See [`docs/rule-id-migrations.md`](docs/rule-id-migrations.md).
- Rule files are laid out by category then platform, mirroring the rule ID:
  `correctness/amiga-tas-unsupported` now lives in
  `correctness/amiga/tas-unsupported.ts` rather than under a separate
  `platform/` tree.

- Rule files are named after the rules they hold rather than where the rules
  came from. `flamewing-shifts.ts` is now `known-register-shifts.ts`,
  `vasm-logical-identities.ts` is `logical-identity-to-tst.ts`, and so on for
  eleven source-named files. `tricks-and-traps.ts` held three unrelated rules
  grouped only by provenance and is split into one file each. Ten more
  single-rule files whose names had drifted now match their rule. Grouping
  closely related rules in one file is unchanged.

- Diagnostics no longer name their sources. Notes read as the linter's own
  findings and explain the mechanism rather than citing ASP68K, Flamewing or
  68kcounter: `MOVEQ encodes the value in the instruction word, so no extension
words are needed` in place of `ASP68K records a 4-byte size saving for this
form`. A reader has no way to check what a source said, and a claim repeated
  is a claim owned. Provenance stays in rule metadata and the coverage
  manifests, and still appears in the generated rule documentation. The CLI's
  `source size claim` line is gone; the claim remains in JSON output for
  auditing. A test guards against attribution reappearing in emitted text.

- CLI impact output is one line instead of five, in the `cycles(reads,writes)`
  shape the 68k manuals and 68kcounter use: `saves: 4 bytes, 8(2,0) cycles`.
  Numbers read as savings, so positive is cheaper than before and a cost shows
  as a negative saving; with colour, savings are green and costs red. The
  separate size, assessment and per-metric cycle lines are gone.
- The suggestion heading is now `fix:`. It read `suggestion:` directly under the
  `suggestion` severity column, which looked like a mistake.
- Added `--color` to force ANSI colours on when stdout is not a TTY.

### Fixed

- Register analysis now records that postincrement and predecrement update
  their address register. An `addEaSideEffectWrite` helper existed but was
  wired into the MOVEM branch only, so for every other instruction the value
  analysis believed a pointer still held its pre-increment value: after
  `lea $1000,a2` and `move.w (a2)+,d1` it reported `a2` as `$1000` rather than
  unknown. Any rule resolving an address register could be misled by that,
  including the Amiga custom-register checks.

- `suspicious/partial-register-write` no longer flags a narrow load into a
  register that was seeded with a known value. `moveq #0,d2` followed by
  `move.b 0(a2,d1.w),d2` is the ordinary zero-extension idiom, where the
  preserved bits are the point rather than an oversight. Constant propagation
  supplies the value, so the seed need not be the preceding instruction, and
  `CLR` or a non-zero seed work as well as `MOVEQ #0`.

- `correctness/amiga-tas-unsupported` no longer flags `TAS Dn`. What the Amiga
  cannot arbitrate is the locked read-modify-write bus cycle TAS uses to reach
  memory; a data-register operand performs no memory access and is safe. This
  was reported at `error` severity on correct code.
- `suspicious/atari-trap-stack-cleanup` no longer flags calls whose parameters
  are removed by a later batched adjustment. Making several calls and then
  clearing all their parameters at once is a documented idiom, and comparing
  each call against the next instruction reported every call but the last.
  Pushes are now accumulated across calls and checked against the adjustment
  that eventually follows.

- `suspicious/nop` no longer flags a NOP immediately before `RTE`. That is the
  standard interrupt-exit delay: on Amiga the interrupt-request clear has to
  reach the chipset before the return, or a fast CPU returns while the level is
  still asserted and the interrupt fires again. A contiguous run of NOPs counts,
  since some handlers use more than one, and an intervening label is tolerated
  because the NOP still falls through to the return; an intervening instruction
  is not. `RTR` is deliberately not covered. Not gated on `--platform amiga`,
  because the idiom appears in sources linted without a platform selected.

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

- **Breaking:** `optimization/addq-address-word-size` and
  `optimization/subq-address-word-size`. ASP68K records a speed win and
  `M68000UM` lists `ADDQ.W #<data>,An` as `4(1/0)`, but Yacht documents that
  figure as an error: the same microwords drive both forms, patent USP4325121
  gives 8 cycles, and real-hardware evaluation confirms it. The EAB thread says
  the same independently from measurement, and exact auditing here measures no
  difference. With no size difference either, the transform did nothing. Their
  ASP68K rows are now marked rejected.

- **Breaking:** the `performance` rule category. It never had any rules, and
  nothing belonged in it: branch collapsing and redundant reloads are ordinary
  `optimization` substitutions. It is gone from `RuleCategory`, the CLI `--only`
  and `--disable-category` lists, the JSON schema, the config loader and the
  impact-measurement paths. A config setting `categories.performance` now errors
  rather than being silently ignored. See [`docs/rule-roadmap.md`](docs/rule-roadmap.md).

### Added

- `suspicious/dead-register-write` — a write whose value is overwritten before
  anything reads it. Usually a typo, where the write was meant for a different
  register, rather than an intentional waste of two bytes, which is why it is
  `suspicious` rather than an optimization. The instruction must write one
  register and its flags, both provably unused. A dead load from memory is
  reported too, but only ever for review: the address may be a register that
  changes state when read. A stepped pointer is excluded, since postincrement
  and predecrement write their address register as well. Dead stores to memory
  are out of scope, needing alias analysis.

- Three more rules from the saved sources: `optimization/carry-to-mask-via-subx`
  (`scs`/`ext.w`/`ext.l` is a single `subx.l dn,dn`, but only where one
  instruction defines both C and X, since CMP sets C and leaves X stale),
  `optimization/arithmetic-immediate-via-scratch` (a long immediate in the
  MOVEQ range is cheaper through a dead scratch register) and a target gate on
  `optimization/fold-index-into-effective-address`, which is now offered only
  for the 68000 family and 68060 because the 68020 and 68040 prefer the address
  precomputed into the register.

- Three rules mined from the saved EAB thread: `optimization/mask-via-moveq`
  (`move.l (a0),d0` / `and.l #$3f,d0` becomes a MOVEQ seed plus an AND of the
  source, since MOVEQ carries its value in the instruction word),
  `optimization/data-register-sign-bit-to-tas` (`bset #7,dn` and
  `ori.b #$80,dn` are a single TAS; unlike the memory form this is on by
  default, because a data-register operand performs no memory access) and
  `optimization/fold-index-into-effective-address` (an index added to an
  address register purely to dereference it is what the indexed mode does).

- `suspicious/movem-restore-mismatch` — a MOVEM save and its matching restore
  must move the same register list. When the counts differ the stack pointer is
  left unbalanced; when they match but the registers do not, the stack survives
  and registers quietly take each other's values. Reports which registers are
  saved but not restored and vice versa, catches a size mismatch, and points at
  the matching save. Handles nested saves and stacks held in an address register
  other than A7, and stays quiet where the pairing is not knowable, such as a
  routine with more than one exit.

- `m68k-lint --init` writes a project config interactively, asking for platform,
  processors, optimization goal and the style preset. Source globs are suggested
  from where the assembly files actually are, which means `**` when any sit in
  the project root. It writes only the answers that differ from the defaults,
  and gives an ignore entry naming a bare directory the
  trailing `/**` it needs to match anything. It shows the file before writing
  and will not overwrite an existing config without asking.

- `correctness/amiga-bit-mask-constant` — catches `DMAB_*`/`INTB_*` bit numbers
  used where `DMAF_*`/`INTF_*` masks are required, and the reverse. The names
  differ by one letter, so an editor completion picks the wrong one easily and
  the value is silently wrong rather than rejected. Handles ORed lists with
  either `!` or `|`, resolves the target through both absolute addresses and the
  `CUSTOM` base convention including byte forms like `intreqr+1(a6)`, and
  offers the corrected line. Classification is by symbol name, so no include
  files are needed.
- `suspicious/atari-trap-stack-cleanup` — GEMDOS, BIOS and XBIOS take their
  parameters on the stack and the caller removes them. This compares the pushes
  immediately before a trap against the adjustment immediately after, so it
  needs no table of TOS function signatures and does not depend on the TOS
  version. A byte push counts as two, since A7 stays word-aligned. TRAP #2 is
  excluded because GEM passes a parameter block in registers, and the
  non-returning GEMDOS calls (Pterm0, Pterm, Ptermres) are exempt.
- `--platform atari`, applying
  `suspicious/unexpected-absolute-address` to the Atari map. Atari hardware
  registers are conventionally written as a sign-extended absolute short, so
  `$FFFF8240.W`, `$FF8240` and the negative word `-32192` all name the same
  register; all three are recognised, since the 68000 address bus is 24 bits and
  ignores A24-A31. Expected regions are `$000000-$0005FF` (exception vectors and
  system variables), `$FF8000-$FFFA3F` (memory controller, video, DMA, PSG,
  blitter and the MFP register file), `$FFFA80-$FFFABF` (the second MFP on Mega
  STE and TT) and `$FFFC00-$FFFC07` (keyboard and MIDI ACIAs). One identifier
  covers the family: model-specific hardware sits inside the same blocks, so
  splitting per model would only narrow the map, and the 68030 in the TT and
  Falcon is already expressible as `--cpu mc68030`.
- `optimization/movea-immediate-to-lea` now covers symbolic address loads, not
  just immediates that fold to a constant: `move.l #label,a0` becomes
  `lea label,a0`. Anything loaded into an address register is an address either
  way. The suggestion carries no size suffix for `.L`, since an explicit `.L`
  would pin the operand to absolute long and stop the assembler relaxing it to
  PC-relative; `.W` keeps its suffix because MOVEA.W sign-extends. The rule is
  no longer gated to 68000/68010: that gate served an ASP68K speed claim which
  exact auditing does not bear out, as the two forms measure identically.
- `--platform atari`, applying
  `suspicious/unexpected-absolute-address` to the Atari map. Atari hardware
  registers are conventionally written as a sign-extended absolute short, so
  `$FFFF8240.W`, `$FF8240` and the negative word `-32192` all name the same
  register; all three are recognised, since the 68000 address bus is 24 bits and
  ignores A24-A31. Expected regions are `$000000-$0005FF` (exception vectors and
  system variables), `$FF8000-$FFFA3F` (memory controller, video, DMA, PSG,
  blitter and the MFP register file), `$FFFA80-$FFFABF` (the second MFP on Mega
  STE and TT) and `$FFFC00-$FFFC07` (keyboard and MIDI ACIAs). One identifier
  covers the family: model-specific hardware sits inside the same blocks, so
  splitting per model would only narrow the map, and the 68030 in the TT and
  Falcon is already expressible as `--cpu mc68030`.
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
