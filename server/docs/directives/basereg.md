# BASEREG - Start base-relative addressing

## Syntax
```assembly
basereg <expression>,<An>
```

## Description
Starts a block of base-relative addressing through register An (remember that A7 is not allowed as a base register). The programmer has to make sure that `<expression>` is placed into An first, while the assembler automatically subtracts `<expression>`, which is usually a program label with an optional offset, from each displacement in a `(d,An)` addressing mode. basereg has priority over the near directive. Its effect can be suspended with the `endb` directive. It is allowed to use several base registers in parallel.