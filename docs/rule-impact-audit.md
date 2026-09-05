# Rule impact audit

`m68k-lint --audit-rule-impact` runs one representative example for every optimization rule.

For rules applicable to `mc68000`, the example is linted with only that rule enabled and the actual replacement is measured using the same `68kcounter` adapter used during normal linting. Results are classified as `improvement`, `tradeoff`, `neutral`, or `regression` from exact byte/CPU/read/write deltas.

Rules that cannot be measured by a 68000-only counter (for example 68030/68060 or 68020+ long MUL/DIV forms) must have an explicit exemption. A rule with no audit registry entry is `missing-case`; an example that no longer triggers its rule is `not-triggered`. Both are audit failures so new rules cannot silently escape validation.

The audit is deliberately a representative timing smoke test, not a semantic proof. Normal rule tests remain responsible for value, CCR, register-liveness, aliasing, and control-flow correctness. Parameterized rules should gain more than one audit case when their timing materially varies by operand form.
