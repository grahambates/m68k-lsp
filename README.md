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
  suggestion: Use moveq #42,d3 (safe)
  replace with: moveq #42,d3
  size: 6 → 2 (-4) bytes (exact)
  measured assessment: improvement
  CPU cycles: 12 → 4 (-8) on mc68000 (exact)
```

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

| Option | Description |
| --- | --- |
| `--config <path>` | Use a specific JSON config file |
| `--no-config` | Disable config-file discovery |
| `--ext <ext,...>` | Extensions for directory/glob discovery (default `.s,.asm,.i`) |
| `--ignore-pattern <glob>` | Ignore matching files (repeatable) |
| `--cpu <cpu,...>` | Target processor(s), default `mc68000` |
| `--platform <generic\|amiga>` | Target platform, default `generic` |
| `--preset <name,...>` | Enable rule presets: `recommended`, `style` |
| `--goal <balanced\|speed\|size>` | Filter known optimization trade-offs |
| `--impact` / `--no-impact` | Enable/disable exact 68000 measurement |
| `--inline-config` / `--no-inline-config` | Honour `m68k-lint` comment directives |
| `--impact-summary` | Summarize measured outcomes by rule |
| `--audit-rule-impact` | Run the representative 68000 timing audit |
| `--only <category,...>` | Run only selected rule categories |
| `--disable-category <category>` | Disable a category (repeatable) |
| `--rule <id>=<setting>` | Override a rule: `off\|error\|warning\|suggestion\|info` |
| `--format <pretty\|json>` | Output format, default `pretty` |
| `--fail-on <severity>` | Exit 1 at this severity or higher, default `error` |
| `--list-rules` | List built-in rules and exit |
| `--asp68k-coverage` | Show tracked ASP68K table coverage and exit |
| `--no-color` | Disable ANSI colours |

Parser errors and `error`-severity diagnostics exit 1; warnings and suggestions
are printed but do not fail the command. `--fail-on` makes CI stricter. Usage
and configuration errors exit 2.

## Library

```ts
import { lintSource } from "m68k-lint";

const diagnostics = lintSource([
  "\tmovea.l d0,a0",
  "\tbeq     .null",
  ".null:",
  "\trts",
].join("\n"));
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

ctx.flags.isLiveAfter(0, "Z");     // "dead"  - MOVE overwrites it
ctx.flags.isLiveAfter(0, "X");     // "unknown" - MOVE preserves X, RTS escapes
ctx.registers.isLiveAfter(0, "d0") // "dead" | "live" | "unknown"
```

## Configuration

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

## Rules

See [`docs/rules.md`](docs/rules.md) for the full generated table, or run
`m68k-lint --list-rules`.

| Category | Count | Purpose |
| --- | --- | --- |
| `correctness` | 3 | Valid assembly with a provable semantic or runtime problem |
| `suspicious` | 8 | Valid code that may be intentional but is easy to misread |
| `optimization` | 106 | Smaller or faster equivalents, gated on target and liveness |
| `style` | 7 | Subjective conventions, opt-in |

`severity`, `confidence` and `applicability` are independent. Applicability is
always explicit:

- **safe** — the replacement is equivalent and every observable difference is
  proven dead.
- **conditional** — equivalent under a stated condition the linter cannot prove.
- **manual** — a real candidate that needs human judgement, e.g. tail calls,
  which change stack depth in a way the callee can observe.

The linter deliberately does not duplicate assembler validation. Illegal
instruction, size and addressing-mode combinations belong to the assembler unless
the linter can add materially better semantic or contextual information.

### Presets

`recommended` is the default baseline. `style` enables the subjective convention
rules. A handful of alias-preference rules are individually opt-in rather than
part of any preset, because they conflict in pairs — do not enable both sides of
`prefer-dbra` / `prefer-dbf` at once. Explicit rule settings beat presets.

### Platform modes

`--platform amiga` adds Amiga-specific correctness and footgun rules on top of
generic 68k linting: unsupported `TAS`, custom-chip register access direction,
and absolute addresses outside the expected vector, custom-chip and CIA regions
(the common typo where an intended immediate is written without `#`).

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

Runs one representative example for every optimization and performance rule.
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
[`docs/rule-impact-audit.md`](docs/rule-impact-audit.md).

## Development

```sh
npm ci
npm run lint          # typecheck src and src/test
npm test
npm run build
npm run audit:impact
npm run docs:rules    # regenerate docs/rules.md
```

Rule fixtures in `src/test` are written in compact column-zero form and indented
by the helpers in `src/test/helpers.ts`, which share one indent rule with the
impact audit. Use `lint()` / `ids()` from that module rather than calling
`lintSource` directly.

## License

MIT
