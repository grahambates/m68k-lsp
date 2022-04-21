# ADDI - Add immediate

## Operation
[destination] ← \<literal\> + [destination]

## Syntax
```assembly
ADDI[.(bwl)] #<data>,<destination>
```

## Attributes
`Size` byte, word, longword

## Description
Add immediate data to the destination operand. Store the result in the destination operand. `ADDI` can be used to add a literal directly to a memory location. For example, `ADDI.W #$1234,$2000` has the effect [M(2000₁₆)]←[M(2000₁₆)]+1234₁₆.

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|*|*|*|*|*|

## Destination operand addressing modes
|Dn|An|(An)|(An)+|&#x2011;(An)|(d,An)|(d,An,Xi)|ABS.W|ABS.L|(d,PC)|(d,PC,Xn)|imm|
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|✓||✓|✓|✓|✓|✓|✓|✓||||

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*