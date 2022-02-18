# NEAR - Enables small data mode

## Syntax
```assembly
near [<An>]
```

## Description
Enables small data (base-relative) mode and sets the base register to `An`. `near` without an argument will reactivate a previously defined small data mode, which might be switched off by a far directive.