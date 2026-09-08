# BLT - Branch on less than (signed)

## Operation
If N.V̅ + N̅.V THEN [PC] ← [PC] + d

## Syntax
```assembly
BLT <label>
```

## Sample syntax
```assembly
BLT Loop_4
BLT *+8
```

## Attributes
`BLT` takes an 8-bit or a 16-bit offset (i.e., displacement).

## Description
If less than, program execution continues at location [PC] + displacement, d. The displacement is a two's complement value. The value in the PC corresponds to the current location plus two. The range of the branch is -126 to +128 bytes with an 8-bit offset, and -32K to +32K bytes with a 16-bit offset.

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|-|-|-|-|-|

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*