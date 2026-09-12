# SBCD - Subtract decimal with extend

## Operation
[destination]₁₀ ← [destination]₁₀ - [source]₁₀ - [X]

## Syntax
```assembly
SBCD[.b] Dy,Dx
SBCD[.b] -(Ay),-(Ax)
```

## Attributes
`Size` byte

## Description
Subtract the source operand from the destination operand together with the X-bit, and store the result in the destination. Subtraction is performed using BCD arithmetic. The only legal addressing modes are data register direct and memory to memory with address register indirect using auto-decrementing.

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|*|U|*|U|*|

Z: Cleared if result is non-zero. Unchanged otherwise. The Z-bit can be used to test for zero after a chain of multiple precision operations.

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*