# 68000 impact measurement

`m68k-lint` measures optimization replacements with `68kcounter` when `mc68000`
is selected. 68kcounter reports CPU cycles, external bus read cycles, external bus
write cycles, and encoded bytes for 68000 source instructions.

Measurements are attached after rule matching, so optimization rules remain
independent of the measurement backend. Historical ASP68K/Flamewing/other source
claims remain provenance; when an exact measurement supersedes a source metric the
source claim is retained separately.

## Assessments

Exact deltas are classified as:

- `improvement`: at least one measured resource improves and none regress.
- `tradeoff`: at least one improves and at least one regresses.
- `neutral`: all available exact deltas are zero.
- `regression`: at least one resource regresses and none improve.

A regression does not invalidate semantic equivalence. It means the rule should be
re-audited as an _optimization_ for the 68000, including its original CPU gating and
historical timing assumptions.

## Limitations

68kcounter operates on source and cannot account for assembler optimizations. It may
also omit timings for source it cannot fully model or for path-dependent timing. In
those cases m68k-lint preserves the diagnostic and omits unavailable exact metrics.
