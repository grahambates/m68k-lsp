# FPU - Enables FPU code generation

## Syntax
```assembly
fpu <cpID>
```

## Description
Enables 68881/68882 FPU code generation. The `<cpID>` is inserted into the FPU instructions to select the correct coprocessor. Note that `<cpID>` is always 1 for the on-chip FPUs in the 68040 and 68060. A `<cpID>` of zero will disable FPU code generation.