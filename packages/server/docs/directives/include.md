# INCLUDE - Read source file from disk

## Syntax
```assembly
INCLUDE <file>
```

## Description
Include source text of `<file>` at this position.
The include file will be searched first in the current directory, then in all paths defined by `-I` or `incdir` in the order of occurrence.
