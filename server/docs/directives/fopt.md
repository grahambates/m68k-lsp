# FOPT - Floating point options

## Syntax
```assembly
FOPT option<,option>
```

## Description
This directive allows you to set the floating point co-processor identifier and the rounding and precision of the assembler's internal floating point calculations.

This directive allows you to set the floating point co-processor identifier and the rounding and precision of the assembler's internal floating point calculations. The valid options are:

- `ID=<id>` This sets the co-processor identifier. By default, this is 1 as used on the Amiga® 3000 and as recommended by Motorola. However for systems with more than one FPU you will need to set this.
- `ROUND=<type>` This is used to set the rounding method used by internal floating point operations. `<type>` should be one of: N round to the nearest
  - `Z` round towards zero
  - `P` round towards + infinity
  - `M` round towards - infinity
  These correspond to the RND portion of the FPCR mode control byte. The default value is `N`.

- `PREC=<type>`
  This is used to set the precision used by internal floating point operations. `<type>` should be one of:
  - `X` extended precision S single precision
  - `D` double precision
  These correspond to the PREC portion of the FPCR mode control byte. The default value is `X`.