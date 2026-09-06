# Prior art

Notes on established tooling that solves problems this project also has, and
what is worth borrowing. Written after noticing that several rules here are
textbook compiler analyses arrived at independently — `dead-register-write` is
dead store elimination, `known-zero-clear` is constant propagation, the multiply
rules are strength reduction.

## Clippy: the category taxonomy

[Clippy](https://doc.rust-lang.org/clippy/lints.html) splits lints into
categories with published definitions and per-category default levels. Two of
them match the distinction this project reached independently, and are worth
quoting because they settle an argument we had:

| Category      | Default | Definition                                               |
| ------------- | ------- | -------------------------------------------------------- |
| `correctness` | deny    | "Code that is outright wrong or useless"                 |
| `suspicious`  | warn    | "Code that is suspicious but may be intentional"         |
| `complexity`  | warn    | "Code that can be simplified while preserving semantics" |
| `perf`        | warn    | "Code that can be optimized for better performance"      |
| `style`       | warn    | Code that isn't idiomatic                                |
| `pedantic`    | allow   | Overly strict checks for power users                     |
| `nursery`     | allow   | Buggy or experimental lints needing more work            |
| `restriction` | allow   | Lints that restrict language features                    |

Three things follow.

**Keeping `correctness` separate from `suspicious` is mainstream, not a
quirk.** Clippy's `suspicious` is described as "similar to correctness but
acknowledges intentional code patterns", which is precisely why
`stale-condition-code` and `dead-register-write` moved there: both flag things
that can be deliberate. `correctness` earning deny-by-default with "minimal
false positives" is also the right bar for the three Amiga rules left in it.

**Clippy splits our `optimization` in two**, into `complexity` (simplify while
preserving semantics) and `perf` (make it faster). We removed `performance` as
having nothing in it, which is still right — the split does not carry over,
because at this level nearly every simplification is also a saving, and the
audit measures that directly. Worth knowing the precedent exists if the
distinction ever becomes useful.

**`nursery` has no equivalent here.** A rule that is plausible but not yet
trusted currently has nowhere to live except off-by-default with no signal about
why. Several rules in `docs/rule-roadmap.md` are in exactly that state.

Clippy also carries a category for lints that are opt-in by nature. This project
does the same job with `enabledByDefault: false` plus presets, which is closer to
ESLint. Both work; the difference is whether opt-in is a property of the rule or
of the category.

## ESLint: the surface this project already copies

Inline `m68k-lint-disable` directives, presets, per-rule severity overrides and
the config-file cascade are all ESLint shapes, deliberately. Two places where it
is worth checking we have kept the useful part:

- ESLint separates an autofix from a _suggestion_: a fix is applied by
  `--fix`, a suggestion is offered to the editor for a human to pick. This
  project's `applicability: safe | conditional | manual` carries the same
  information more precisely, and is the better model, since a 68k rewrite is
  often correct only under a condition the linter can state but not prove.
- ESLint has no `--fix` equivalent here at all yet. The replacement text exists
  and is line-scoped, so the mechanism is mostly in place.

## Superoptimizers: finding peepholes rather than transcribing them

Every optimization rule here came from a document — ASP68K, Flamewing, vasm, the
EAB thread. That is inherently limited to what someone wrote down.

Massalin's 1987 paper
[_Superoptimizer: a look at the smallest program_](https://web.stanford.edu/class/cs343/resources/superoptimizer.pdf)
takes the other approach, and did it **on the 68000**. It enumerates short
instruction sequences exhaustively and keeps the shortest one that computes a
given function, with a probabilistic pre-filter to make the search tractable.
The results are described as "convoluted bit-fiddling bearing little resemblance
to the source programs", which is a fair description of `subx.l d0,d0` for
carry-to-mask, or the `swap`/`ext` shift reductions.

The relevance is direct: an exhaustive search over a small 68000 subset, scored
by `68kcounter`, would find peepholes no document lists, and would also confirm
that the ones we have are actually minimal. Later work in the same line —
GNU superoptimizer, STOKE, souper — mostly scales the idea to larger
instruction sets, which is not the constraint here.

## Alive2: the gap in the audit

The impact audit proves a replacement is _cheaper_. Nothing proves it is
_equivalent_.

Every rule's semantics rest on hand-reasoning recorded in comments: that MOVEA.W
sign-extends so the suffix must be pinned, that SCS reads C while SUBX reads X,
that BSET and ORI differ from TAS in different flags. That reasoning has been
wrong at least once in this project's history and will be again.

[Alive2](https://github.com/AliveToolkit/alive2) solves this for LLVM by
translating a peephole and its replacement into SMT and proving equivalence, and
has found real miscompilations that review missed. The 68000 equivalent does not
need SMT: the state is small and concrete, so differential testing is enough.

**This is now built**, as `npm run verify:semantics` — see
[`differential-checker.md`](differential-checker.md). It takes the before and
after of each audit case, runs both on an interpreter over seeded inputs, and
compares every register and all five condition-code bits. It has found three
real rule defects so far, described there.

## Not found

No established linter for retro assembly turned up to compare against
directly — the closest neighbours are compiler peephole passes and
architecture-specific superoptimizers, neither of which is packaged as a
developer-facing linter. The design questions this project keeps running into
are general linter questions, which is why Clippy and ESLint are the better
references despite targeting very different languages.
