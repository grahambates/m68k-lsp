# Rule ID migrations

Rule IDs are now descriptive and source-neutral. Source provenance remains in rule metadata and audit documentation. If you have `--rule` overrides or editor configuration using an old ID, migrate it as follows:

| Old ID                                                    | New ID                                          |
| --------------------------------------------------------- | ----------------------------------------------- |
| `optimization/flamewing-movea-immediate-word`             | `optimization/narrow-movea-immediate-word`      |
| `optimization/flamewing-address-immediate-word`           | `optimization/narrow-address-immediate-word`    |
| `optimization/flamewing-long-word-mask`                   | `optimization/simplify-long-word-mask`          |
| `optimization/flamewing-byte-rotate-direction`            | `optimization/normalize-byte-rotate-direction`  |
| `optimization/flamewing-known-register-rotate`            | `optimization/known-register-rotate`            |
| `optimization/flamewing-roxl-addx`                        | `optimization/roxl-to-addx`                     |
| `optimization/flamewing-lsl-byte-seven`                   | `optimization/lsl-byte-seven`                   |
| `optimization/flamewing-known-register-shift-clear`       | `optimization/known-register-shift-to-clear`    |
| `optimization/flamewing-lsr-byte-seven`                   | `optimization/lsr-byte-seven`                   |
| `optimization/flamewing-asr-byte-saturate`                | `optimization/asr-byte-saturate`                |
| `optimization/flamewing-known-register-shift-reduction`   | `optimization/known-register-shift-reduction`   |
| `optimization/flamewing-known-register-asr-word-low-only` | `optimization/known-register-asr-word-low-only` |
| `optimization/flamewing-known-register-asr-long-high`     | `optimization/known-register-asr-long-high`     |
| `optimization/flamewing-known-register-asr-saturate`      | `optimization/known-register-asr-saturate`      |
| `optimization/flamewing-address-arithmetic-indexed-lea`   | `optimization/address-arithmetic-indexed-lea`   |
| `optimization/flamewing-muls-word-full-result-constants`  | `optimization/muls-word-full-result-constants`  |
| `optimization/flamewing-muls-word-low-word-only`          | `optimization/muls-word-low-word-only`          |
| `optimization/flamewing-mulu-word-low-word-only`          | `optimization/mulu-word-low-word-only`          |
| `optimization/flamewing-move-byte-and-mask`               | `optimization/move-byte-and-mask`               |
| `optimization/flamewing-stack-word-shift-eight`           | `optimization/stack-word-shift-eight`           |
| `optimization/flamewing-stack-known-register-shift`       | `optimization/stack-known-register-shift`       |
| `optimization/vasm-andi-all-ones-tst`                     | `optimization/andi-all-ones-to-tst`             |
| `optimization/vasm-ori-zero-tst`                          | `optimization/ori-zero-to-tst`                  |
| `optimization/vasm-eori-zero-tst`                         | `optimization/eori-zero-to-tst`                 |
| `optimization/vasm-cmpa-immediate-word`                   | `optimization/narrow-cmpa-immediate-word`       |
| `optimization/vasm-negative-signed-multiply`              | `optimization/negative-signed-multiply`         |
| `optimization/tricks-compare-moveq`                       | `optimization/compare-long-immediate-via-moveq` |
| `optimization/tricks-compare-subq-branch`                 | `optimization/destructive-small-compare-branch` |
| `optimization/tricks-jsr-jmp-dispatch`                    | `optimization/jsr-jmp-tail-dispatch`            |
| `optimization/negate-add-power-of-two-to-eor`              | `optimization/negate-add-mask-to-eor`           |

## Category change

`stale-condition-code` moved from `correctness` to `suspicious`. It fires when
no concrete definition of the tested flag can be shown to reach the conditional,
which in practice usually means the producer is in another file or the routine
is entered from elsewhere: an analysis limitation rather than a proven fault.
Relying on the CCR surviving across address arithmetic is also a deliberate
technique. Its sibling `suspicious/condition-after-preserved-ccr` already covers
the case that can be proven, so the less certain rule was carrying the stronger
category.

| Old ID                             | New ID                            |
| ---------------------------------- | --------------------------------- |
| `correctness/stale-condition-code` | `suspicious/stale-condition-code` |
