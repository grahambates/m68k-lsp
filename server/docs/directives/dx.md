# DX - Define constant block BSS

## Syntax
```assembly
DX[.(bdlqswx)] <exp>
```

## Description
Tries to allocate space in the DataBss portion of a code or data section.
Otherwise equivalent to `dcb.(bdlqswx) <exp>,0`.
