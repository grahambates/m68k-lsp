# BCS - Branch on carry set (lower than - unsigned)

## Operation
If C THEN [PC] ← [PC] + d

## Syntax
```assembly
BCS <label>
```

## Sample syntax
```assembly
BCS Loop_4
BCS *+8
```

## Attributes
`BCS` takes an 8-bit or a 16-bit offset (i.e., displacement).

## Description
If the the carry bit is set, program execution continues at location [PC] + displacement, d. The displacement is a two's complement value. The value in the PC corresponds to the current location plus two. The range of the branch is -126 to +128 bytes with an 8-bit offset, and -32K to +32K bytes with a 16-bit offset. A short branch to the next instruction is impossible, since the branch code 0 indicates a long branch with a 16-bit offset. The assembly language form `BCS *+8` means branch to the point eight bytes from the current PC if the carry bit is set.

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|-|-|-|-|-|

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*