# BPL - Branch on plus (i.e., positive)

## Operation
If N̅ THEN [PC] ← [PC] + d

## Syntax
```assembly
BPL <label>
```

## Sample syntax
```assembly
BPL Loop_4
BPL *+8
```

## Attributes
`BPL` takes an 8-bit or a 16-bit offset (i.e., displacement).

## Description
If the negative bit is clear, program execution continues at location [PC] + displacement, d. The displacement is a two's complement value. The value in the PC corresponds to the current location plus two. The range of the branch is -126 to +128 bytes with an 8-bit offset, and -32K to +32K bytes with a 16-bit offset.

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|-|-|-|-|-|

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*