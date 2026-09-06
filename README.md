# m68k-lint

Extensible static analysis and linting for Motorola 68k assembly, built on
[`m68k-parser`](https://github.com/grahambates/m68k-parser).

124 built-in rules across correctness, suspicious-construct, optimization and
style checks, backed by condition-code liveness, register liveness and constant
propagation. Optimization suggestions on `mc68000` carry **exact** measured
size and cycle deltas from [`68kcounter`](https://github.com/grahambates/68kcounter),
so a claimed improvement is a measured one.

```
game.s:42:9  suggestion  Immediate 42 fits the MOVEQ signed 8-bit range  [optimization/prefer-moveq]
        move.l #42,d3
        ^~~~
  fix: Use moveq #42,d3 (safe)
  replace with: moveq #42,d3
  saves: 4 bytes, 8(2,0) cycles
```

Measurements read as savings in the `cycles(reads,writes)` shape the 68k manuals
use, so bigger is better; a cost shows as a negative saving. With colour, savings
are green and costs red.

## Install

```sh
npm install --save-dev m68k-lint
```

Requires Node 20 or newer.

## Command line

```sh
m68k-lint game.s
m68k-lint src/
m68k-lint "src/**/*.asm"
m68k-lint --platform amiga --cpu mc68000 src/
```

Directories and globs recursively discover `.s`, `.asm` and `.i` by default;
explicit file paths are always linted whatever their suffix.

| Option                                   | Description                                                    |
| ---------------------------------------- | -------------------------------------------------------------- |
| `--config <path>`                        | Use a specific JSON config file                                |
| `--no-config`                            | Disable config-file discovery                                  |
| `--ext <ext,...>`                        | Extensions for directory/glob discovery (default `.s,.asm,.i`) |
| `--ignore-pattern <glob>`                | Ignore matching files (repeatable)                             |
| `--cpu <cpu,...>`                        | Target processor(s), default `mc68000`                         |
| `--platform <generic\|amiga>`            | Target platform, default `generic`                             |
| `--preset <name,...>`                    | Enable rule presets: `recommended`, `style`                    |
| `--goal <balanced\|speed\|size>`         | Filter known optimization trade-offs                           |
| `--impact` / `--no-impact`               | Enable/disable exact 68000 measurement                         |
| `--inline-config` / `--no-inline-config` | Honour `m68k-lint` comment directives                          |
| `--impact-summary`                       | Summarize measured outcomes by rule                            |
| `--audit-rule-impact`                    | Run the representative 68000 timing audit                      |
| `--only <category,...>`                  | Run only selected rule categories                              |
| `--disable-category <category>`          | Disable a category (repeatable)                                |
| `--rule <id>=<setting>`                  | Override a rule: `off\|error\|warning\|suggestion\|info`       |
| `--format <pretty\|json>`                | Output format, default `pretty`                                |
| `--fail-on <severity>`                   | Exit 1 at this severity or higher, default `error`             |
| `--list-rules`                           | List built-in rules and exit                                   |
| `--asp68k-coverage`                      | Show tracked ASP68K table coverage and exit                    |
| `--no-color`                             | Disable ANSI colours                                           |

Parser errors and `error`-severity diagnostics exit 1; warnings and suggestions
are printed but do not fail the command. `--fail-on` makes CI stricter. Usage
and configuration errors exit 2.

## Library

```ts
import { lintSource } from "m68k-lint";

const diagnostics = lintSource(["\tmovea.l d0,a0", "\tbeq     .null", ".null:", "\trts"].join("\n"));
```

`lintSource` returns a `Diagnostic[]` sorted by source position. `lintParsedFile`
takes an already-parsed file when you are reusing a parse.

> m68k-parser follows traditional assembler column rules, so a mnemonic must be
> indented. A token in column 0 is a label: `move.l #42,d3` at column 0 parses as
> a label named `move`, not an instruction.

The analyses are available directly for tooling that wants the dataflow rather
than the findings:

```ts
import { parseFile } from "m68k-parser";
import { DefaultRuleContext } from "m68k-lint";

const source = "\tadd.l  d0,d1\n\tmove.l d2,d3\n\trts\n";
const ctx = new DefaultRuleContext(parseFile(source), source, { processors: ["mc68000"] });

ctx.flags.isLiveAfter(0, "Z"); // "dead"  - MOVE overwrites it
ctx.flags.isLiveAfter(0, "X"); // "unknown" - MOVE preserves X, RTS escapes
ctx.registers.isLiveAfter(0, "d0"); // "dead" | "live" | "unknown"
```

## Configuration

```sh
m68k-lint --init
```

Asks for platform, processors, optimization goal and the style preset, then
writes `m68k-lint.json`. Source globs are suggested from where the assembly
files actually are: `**` when any sit in the project root, otherwise the
subdirectories that contain them. Only
answers that differ from the defaults are written, and an ignore entry naming a
bare directory gets the trailing `/**` it needs to match anything. It shows the
file and asks before writing, and asks again before overwriting an existing one.

The CLI searches upward for `m68k-lint.json` or `.m68klintrc.json`. Precedence is
defaults < config file < CLI, with `rules` merged so `--rule` overrides only the
named rule. File and ignore patterns are relative to the config file's directory.

```json
{
  "$schema": "./node_modules/m68k-lint/m68k-lint.schema.json",
  "processors": ["mc68000"],
  "platform": "amiga",
  "goal": "balanced",
  "measureImpact": true,
  "presets": ["recommended"],
  "extensions": [".s", ".asm", ".i"],
  "files": ["src/**", "include/**"],
  "ignores": ["generated/**", "vendor/**"],
  "categories": { "style": false },
  "rules": {
    "suspicious/nop": "off",
    "optimization/bset-to-tas": "off"
  }
}
```

`files` is used when no input path is given on the command line. `include` and
`ignorePatterns` are accepted as aliases of `files` and `ignores`.
`node_modules/**` and `.git/**` are always ignored during discovery.

## Inline directives

```asm
    ; m68k-lint-disable optimization/prefer-moveq
    move.l  #42,d0
    ; m68k-lint-enable optimization/prefer-moveq

    ; m68k-lint-disable-next-line optimization/prefer-moveq
    move.l  #43,d1

    move.l  #44,d2 ; m68k-lint-disable-line optimization/prefer-moveq

* m68k-lint-disable-next-line -- hardware-specific timing sequence
    nop
```

Directives are read from `;` comments and from `*` comments in column 0. Multiple
rule IDs may be comma- or whitespace-separated; a directive with no IDs applies to
every rule; an optional reason may follow `--`.

`disable` stays active until a matching `enable`. `disable-line` affects the
current physical line, `disable-next-line` the following one. Projects that need
centrally enforced configuration can set `"inlineConfig": false` or pass
`--no-inline-config`.

## Constants from other files

Most rules need to know what a constant is worth, and most constants live in an
include rather than in the file being linted. Reconstructing the real include
hierarchy would need the program's entry point and the assembler's include
paths, neither of which is in the source, so m68k-lint instead indexes every
assembly and header file under the project and resolves names from that.

The index only answers for a name the whole project agrees on. Where two files
define one differently — a debug and a release configuration, per-machine
hardware headers — the name stays unknown and the rules that depend on it stay
silent, exactly as they were before the index existed. It can turn "unknown"
into "known", never "known" into "wrong", because a misresolved constant would
make rules fire confidently and wrongly.

Any diagnostic that depended on a value from another file names the file it came
from:

```
  note: Resolved from outside this file: SHIFT_COUNT = 32 (from include/hardware.i).
```

Set `"projectSymbols": false` to analyse each file strictly on its own.

## Rules

See [`docs/rules.md`](docs/rules.md) for the full generated table, or run
`m68k-lint --list-rules`.

| Category       | Count | Purpose                                                     |
| -------------- | ----- | ----------------------------------------------------------- |
| `correctness`  | 3     | Valid assembly with a provable semantic or runtime problem  |
| `suspicious`   | 8     | Valid code that may be intentional but is easy to misread   |
| `optimization` | 106   | Smaller or faster equivalents, gated on target and liveness |
| `style`        | 7     | Subjective conventions, opt-in                              |

`severity`, `confidence` and `applicability` are independent. Applicability is
always explicit:

- **safe** — the replacement is equivalent and every observable difference is
  proven dead.
- **conditional** — equivalent under a stated condition the linter cannot prove.
- **manual** — no single mechanical rewrite exists, so there is nothing to
  offer: a label inside the matched code may be an entry point other code
  branches to, or the finding is a question about intent rather than a
  substitution.

A rewrite is withheld only when there is none to write. Where the text is known
and its correctness rests on something statable but unprovable — a callee that
must not read arguments relative to SP, a device that must tolerate a wider
access — that is `conditional`, and the replacement is given along with the
condition.

## Goals

`--goal speed` and `--goal size` filter optimization suggestions on measured
impact: a rewrite that costs bytes is not offered in a size-focused run, and one
that costs cycles is not offered in a speed-focused run.

Some rewrites only make sense in one direction, and a few have a useful inverse:
doubling a register twice is faster than shifting it left by two, and shifting
is two bytes smaller. Those rules declare which goal they serve, and an inverse
names the rule it undoes. Only one of a pair is ever live — otherwise each would
recreate the other's input, and applying fixes repeatedly would never settle. A
balanced run keeps the canonical direction, which is the rule that does not
declare itself an inverse.

The declaration exists because impact is measured only for 68000 targets and
only when measurement is enabled. It is checked against the audit, so a rule
cannot claim to serve a goal the measurements contradict.

The linter deliberately does not duplicate assembler validation. Illegal
instruction, size and addressing-mode combinations belong to the assembler unless
the linter can add materially better semantic or contextual information.

Syntax errors are not reported for the same reason, and because this parser is
deliberately more permissive than any one assembler: a line it cannot read may
be perfectly valid to yours. A file that does not fully parse is noted once, so
an empty result is not mistaken for a verified one, and does not fail the run.

### Presets

`recommended` is the default baseline. `style` enables the subjective convention
rules. A handful of alias-preference rules are individually opt-in rather than
part of any preset, because they conflict in pairs — do not enable both sides of
`prefer-dbra` / `prefer-dbf` at once. Explicit rule settings beat presets.

### Platform modes

`--platform` adds platform-specific correctness and footgun rules on top of
generic 68k linting: `amiga`, `atari`, or `generic` (the default).

Amiga mode covers unsupported `TAS`, custom-chip register access direction, and
absolute addresses outside the expected vector, custom-chip and CIA regions (the
common typo where an intended immediate is written without `#`).

Atari mode applies the same absolute-address heuristic against the Atari map,
covering the memory controller, video, DMA, PSG, blitter, both MFPs and the
keyboard and MIDI ACIAs. Hardware registers there are conventionally written as
a sign-extended absolute short, so `$FFFF8240.W`, `$FF8240` and the negative
word `-32192` all name the same register and are all recognised — the 68000
address bus is 24 bits and ignores A24-A31.

One identifier covers the family rather than one per model. Model-specific
hardware sits inside the same blocks, so splitting would only narrow the map and
produce false positives on code targeting a range of machines, and the 68030 in
the TT and Falcon is already expressible as `--cpu mc68030`.

Custom-register checks understand include-file conventions, resolving both
`DMACONR(a6)` after `lea CUSTOM,a6` and `DMACONR+CUSTOM` to `$DFF002`.
Project-local symbol definitions take precedence.

## Optimization impact

With `mc68000` selected, replacements are measured through `68kcounter` for
encoded bytes, CPU cycles, and read/write bus cycles. Exact deltas are classified
as `improvement`, `tradeoff`, `neutral` or `regression`.

Measurement is best-effort: unsupported spellings and path-dependent timings omit
the affected metric rather than suppressing the diagnostic. Rule correctness never
depends on measurement being available. Use `--no-impact` to turn it off.

Where an exact measurement contradicts a historical source claim, both are kept
so the discrepancy is auditable. `--impact-summary` groups measured outcomes by
rule, regressions first — useful for finding historical rules whose stated
benefit does not hold for the source forms a project actually contains.

### Optimization goals

```sh
m68k-lint --goal balanced game.s   # default: show valid suggestions regardless of trade-off
m68k-lint --goal speed game.s      # suppress suggestions known to be slower
m68k-lint --goal size game.s       # suppress known code-size increases
```

Unknown performance is never silently treated as a regression.

### Rule impact audit

```sh
npm run audit:impact   # or: m68k-lint --audit-rule-impact
```

Runs one representative example for every optimization rule.
mc68000 cases are measured; rules a 68000-only counter cannot measure must carry
an explicit exemption. Missing cases, examples that no longer trigger,
unmeasured rules and measured regressions all fail the command, so a new rule
cannot silently escape validation.

This is a timing smoke test, not a semantic proof. Value, CCR, register-liveness,
aliasing and control-flow correctness remain the job of the normal rule tests.

## Analysis

Findings are emitted, never edits. Cross-line knowledge lives behind
`RuleContext` rather than inside individual rules, and analysis is conservative:
inability to prove a fact yields `unknown`, never an optimistic assumption.

- **Constants and symbols** — constant-expression evaluation, a file-local table
  for `equ` and `=`, and chained resolution with cycle protection. `set` is
  deliberately excluded because it is mutable and order-sensitive.
- **Control flow** — instruction-level successors and predecessors for
  fallthrough and direct branches, with direct `JMP label` resolved in-file.
  `RTS`, `RTE`, `RTR`, `STOP`, unresolved branches and indirect jumps are escape
  points. Calls keep their fallthrough edge but are opaque CCR boundaries.
- **Condition codes** — `X`, `N`, `Z`, `V` and `C` modelled individually, with
  liveness and reaching definitions.
- **Registers** — per-register liveness, definite constants, constant and copy
  propagation, sub-register (upper/lower word) use tracking, and dead
  data-register discovery for scratch-register optimisations.

Two conservative cases worth knowing, because they surprise people:

```asm
    add.l d0,d1
    rts
```

ADD's flags are `unknown`, not dead — the caller may observe the returned CCR.
The same applies to registers: a register live at `RTS` is `unknown`, since it
may be a return value.

```asm
    add.l  d0,d1
    move.l d2,d3
    rts
```

`N/Z/V/C` are provably dead because MOVE overwrites them. `X` stays `unknown`:
MOVE preserves X and the return escapes analysis.

## Provenance

Rule IDs are descriptive rather than source-named; provenance lives in rule
metadata. See [`docs/rule-id-migrations.md`](docs/rule-id-migrations.md) if you
have overrides using pre-0.40 IDs.

Each corpus is tracked separately so overlapping, corrected or disputed rules can
be reconciled explicitly rather than silently merged. Sources are audited, not
trusted: rows have been rejected for computing the wrong value, for using
encodings that do not exist, and for claiming savings that measurement disproves.

- **ASP68K** — the first corpus. `m68k-lint --asp68k-coverage` reports the
  machine-readable manifest; every transformation row is classified as
  implemented, partial, deferred or rejected.
- **Flamewing's M68000 peephole list** — `src/coverage-flamewing.ts` and
  [`docs/flamewing-audit.md`](docs/flamewing-audit.md).
- **vasm, 68000 Tricks and Traps, EAB discussion** — reviewed in
  [`docs/source-review.md`](docs/source-review.md).

Further reading: [`docs/impact-measurement.md`](docs/impact-measurement.md),
[`docs/rule-impact-audit.md`](docs/rule-impact-audit.md),
[`docs/prior-art.md`](docs/prior-art.md).
Planned rules for the thinner categories, and the policy on what belongs here
rather than in the assembler, are in
[`docs/rule-roadmap.md`](docs/rule-roadmap.md).

## Development

```sh
npm ci
npm run typecheck     # tsc over src and src/test
npm run lint          # eslint
npm run format        # prettier --write
npm test
npm run build
npm run audit:impact
npm run docs:rules    # regenerate docs/rules.md
```

CI runs all of these. `npm run lint:fix` and `npm run format:check` are also
available.

Rule fixtures in `src/test` are written in compact column-zero form and indented
by the helpers in `src/test/helpers.ts`, which share one indent rule with the
impact audit. Use `lint()` / `ids()` from that module rather than calling
`lintSource` directly.

## License

MIT
