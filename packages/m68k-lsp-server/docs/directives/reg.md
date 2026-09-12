# REG - Define register list

## Syntax
```assembly
<symbol> reg <reglist>
```

## Description
Defines a new symbol named `<symbol>` and assign the register list `<reglist>` to it. Registers in a list must be separated by a slash (`/`) and ranges or registers can be defined by using a hyphen (`-`). Examples for valid register lists are: `d0-d7/a0-a6`, `d3-6/a0/a1/a4-5`.