# ANDI - AND immediate

## Operation
[destination] ← \<literal\>.[destination]
[CCR] ← \<data\>.[CCR]
IF [S] = 1
  THEN
    [SR] ← <literal>.[SR]
  ELSE TRAP

## Syntax
```assembly
ANDI[.(bwl)] #<data>,<destination>
ANDI[.b] #<data>,CCR
ANDI[.w] #<data>,SR
```

## Attributes
`Size` byte, word, longword

## Description
*AND* the immediate data to the destination operand. The `ANDI` permits a literal operand to be ANDed with a destination other than a data register. For example, `ANDI #$FE00,$1234` or `ANDI.B #$F0,(A2)+`.

** ANDI to CCR - AND immediate to condition code register **

*AND* the immediate data to the condition code register (i.e., the least-significant byte of the status register).

`ANDI` is used to clear selected bits of the `CCR`. For example, `ANDI #$FA,CCR` clears the Z- and C-bits, i.e., XNZVC = X N 0 V 0.

** ANDI to SR - AND immediate to status register **

*AND* the immediate data to the status register and store the result in the status register. All bits of the SR are affected.

This instruction is used to clear the interrupt mask, the S-bit, and the T-bit of the *SR*. `ANDI #<data>,SR` affects both the status byte of the *SR* and the *CCR*. For example, `ANDI #$7FFF,SR` clears the trace bit of the status register, while `ANDI #$7FFE,SR` clears the trace bit and also clears the carry bit of the *CCR*.

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|-|*|*|0|0|

## Destination operand addressing modes
|Dn|An|(An)|(An)+|&#x2011;(An)|(d,An)|(d,An,Xi)|ABS.W|ABS.L|(d,PC)|(d,PC,Xn)|imm|
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|✓||✓|✓|✓|✓|✓|✓|✓||||

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*