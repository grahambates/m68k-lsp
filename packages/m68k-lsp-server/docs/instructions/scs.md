# SCS - Set on carry set

## Operation
IF C THEN [destination] ← 11111111₂<br/>
&nbsp;&nbsp;ELSE [destination] ← 00000000₂

## Syntax
```assembly
SCS[.b] <destination>
```

## Attributes
`Size` byte

## Description
If the carry bit is set, the bits at the effective address are all set to one (i.e., $FF). Otherwise, the bits at the effective address are set to zeros (i.e., $00).

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|-|-|-|-|-|

## Destination operand addressing modes
|Dn|An|(An)|(An)+|&#x2011;(An)|(d,An)|(d,An,Xi)|ABS.W|ABS.L|(d,PC)|(d,PC,Xn)|imm|
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|✓||✓|✓|✓|✓|✓|✓|✓||||

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*