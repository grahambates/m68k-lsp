# 68kcounter discrepancies

Measurement differences found while auditing rule impact, with the reference
figures from [`sources/yacht.txt`](../sources/yacht.txt). Recorded here because
68kcounter is fixable rather than a fixed constraint; two are worked around in
[`src/analysis/impact.ts`](../src/analysis/impact.ts) and should have their
workarounds removed once fixed.

Reproduce any of these with:

```js
import * as ns from "68kcounter";
const api = ns.default && typeof ns.default === "object" ? ns.default : ns;
const parse = api.default ?? ns.default?.default;
const totals = api.calculateTotals(parse("\tbset.l #3,d0"));
console.log(totals.bytes, totals.max);
```

## 1. A redundant size on a bit instruction adds an extension word

| snippet        | 68kcounter  | yacht.txt     |
| -------------- | ----------- | ------------- |
| `bset #3,d0`   | 4 bytes     | 4 (`10(2/0)`) |
| `bset.l #3,d0` | **6 bytes** | 4             |
| `bclr.l #3,d0` | 4 bytes     | 4             |

BSET on a data register operates on all 32 bits whatever size is written, so
`.l` changes no encoding: the instruction is an opcode word plus a bit-number
word either way. yacht.txt gives `BSET #<data>,Dn .L` as `10(2/0)` — two word
fetches, four bytes. `bclr.l` is sized correctly, so the two disagree with each
other as well as with the reference.

This hid the 2 bytes `optimization/prefer-bset` saves. **Worked around** by
`dropRedundantBitSize` in `normalizeCounterSnippet`, which strips the size from
a bit instruction with a data-register destination before measuring.

## 2. An immediate bit number always bills the slower branch

yacht.txt splits these on the bit number, which is a literal in the instruction
and so knowable without running anything:

| snippet       | 68kcounter | yacht.txt                          |
| ------------- | ---------- | ---------------------------------- |
| `bset #3,d0`  | 12 cycles  | **10** (`data<16`), 12 (`data>15`) |
| `bset #20,d0` | 12 cycles  | 12                                 |
| `bchg #3,d0`  | 12 cycles  | **10**                             |
| `bclr #3,d0`  | 14 cycles  | **12** (`data<16`), 14 (`data>15`) |
| `bclr #20,d0` | 14 cycles  | 14                                 |

BTST has no such split (`#<data>,Dn .L` is a flat `10(2/0)`) and 68kcounter
agrees with it.

The effect is a 2-cycle overstatement of the _replacement_ wherever a rule emits
one of these with a low bit number, which understates the saving by 2 cycles.
**Not worked around**: the numbers reported are conservative in the safe
direction, and patching a cycle table from outside the tool is worse than
fixing it inside.

The `Dn,Dm` forms have the same split on a register's value, which genuinely is
not knowable statically; a range is the right answer there.

## 3. A compound displacement is mis-detected as a wider addressing mode

| snippet                      | 68kcounter        | yacht.txt   |
| ---------------------------- | ----------------- | ----------- |
| `lea 1610(a3),a3`            | 4 bytes, 8 cycles | 4, `8(2/0)` |
| `lea (200*2)(a3),a3`         | **6 bytes, 12**   | 4, 8        |
| `lea 320/2+(100*320)(a3),a3` | **6 bytes, 12**   | 4, 8        |

All three are the same instruction, `LEA (d16,An),An`. A displacement written as
a parenthesised or compound expression stops being recognised as a 16-bit
displacement, and the wider form is billed instead. Symbols alone are fine —
`lea SCREEN_BW(a3),a3` measures correctly — so it is the expression shape rather
than the unresolved name.

This turned `optimization/address-add-to-lea` into a reported regression on
ordinary source such as `adda.w #SCREEN_BW/2+(SCREEN_H/2*SCREEN_BW),a3`.
**Worked around** by `collapseConstantExpressions`, which substitutes the value
an operand expression evaluates to before measuring. That workaround is worth
keeping regardless, since it also resolves symbols the counter cannot see.
