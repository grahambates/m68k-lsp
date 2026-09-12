# SO - Structure offset

## Syntax
```assembly
<label> SO[.(bwlqsdxp)] <expression>
```

## Description
Assigns the current value of the structure offset counter to `<label>`.
Afterwards the counter is incremented by the instruction’s size multiplied by `<expression>`.
The offset counter can also be referenced directly under the name `__SO`.
