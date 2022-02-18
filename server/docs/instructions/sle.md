# SLE - Set on less than or equal (signed)

## Operation
IF Z + N.V̅ + N̅.V THEN [destination] ← 11111111₂<br/>
&nbsp;&nbsp;ELSE [destination] ← 00000000₂

## Syntax
```assembly
SLE[.b] <destination>
```

## Attributes
`Size` byte

## Description
If less than or equal, the bits at the effective address are all set to one (i.e., $FF). Otherwise, the bits at the effective address are set to zeros (i.e., $00).

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|-|-|-|-|-|

## Destination operand addressing modes
|Dn|An|(An)|(An)+|&#x2011;(An)|(d,An)|(d,An,Xi)|ABS.W|ABS.L|(d,PC)|(d,PC,Xn)|imm|
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|✓||✓|✓|✓|✓|✓|✓|✓||||

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*