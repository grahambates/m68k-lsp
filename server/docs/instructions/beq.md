# BEQ - Branch on equal

## Operation
If Z THEN [PC] ← [PC] + d

## Syntax
```assembly
BEQ <label>
```

## Sample syntax
```assembly
BEQ Loop_4
BEQ *+8
```

## Attributes
`BEQ` takes an 8-bit or a 16-bit offset (i.e., displacement).

## Description
If the the zero bit is set, program execution continues at location [PC] + displacement, d. The displacement is a two's complement value. The value in the PC corresponds to the current location plus two. The range of the branch is -126 to +128 bytes with an 8-bit offset, and -32K to +32K bytes with a 16-bit offset. A short branch to the next instruction is impossible, since the branch code 0 indicates a long branch with a 16-bit offset.

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|-|-|-|-|-|

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*