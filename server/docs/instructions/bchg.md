# BCHG - Test a bit and change

## Operation
[Z] ← ¬(\<bit_number\> OF [destination])<br/>
\<bit_number\> OF [destination] ← ¬(\<bit_number\> OF [destination])

## Syntax
```assembly
BCHG[.(bl)] <bit_number>,<destination>
```

## Attributes
`Size` byte, longword

## Description
A bit in the destination operand is tested and the state of the specified bit is reflected in the condition of the Z-bit in the CCR. After the test operation, the state of the specified bit is changed in the destination. If a data register is the destination, then the bit numbering is modulo 32, allowing bit manipulation of all bits in a data register. If a memory location is the destination, a byte is read from that location, the bit operation performed using the bit number modulo 8, and the byte written back to the location. Note that bit zero refers to the least-significant bit. The bit number for this operation may be specified either *statically* by an immediate value or *dynamically* by the contents of a data register.

## Application
If the operation `BCHG #4,$1234` is carried out and the contents of memory location $1234 are 10101010₂ , bit 4 is tested. It is a 0 and therefore the Z-bit of the CCR is set to 1. Bit 4 of the destination operand is changed and the new contents of location 1234₁₆ are 10111010₂.

## Condition codes
|X|N|Z|V|C|
|--|--|--|--|--|
|-|-|*|-|-|

Z: set if the bit tested is zero, cleared otherwise.

## Source operand addressing modes
|Dn|An|(An)|(An)+|&#x2011;(An)|(d,An)|(d,An,Xi)|ABS.W|ABS.L|(d,PC)|(d,PC,Xn)|imm|
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|✓|||||||||||✓|

## Destination operand addressing modes
|Dn|An|(An)|(An)+|&#x2011;(An)|(d,An)|(d,An,Xi)|ABS.W|ABS.L|(d,PC)|(d,PC,Xn)|imm|
|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
|✓||✓|✓|✓|✓|✓|✓|✓||||

Note that data register direct (i.e., Dn) addressing uses a longword operand, while all other modes use a byte operand.

*From MOTOROLA M68000 FAMILY Programmer's reference manual. Copyright 1992 by Motorola Inc./NXP. Adapted with permission.*