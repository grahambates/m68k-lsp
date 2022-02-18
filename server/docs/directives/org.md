# ORG - Set absolute code generation

## Syntax
```assembly
ORG <expression>
```

## Description
Sets the base address for the subsequent code.
Note that it is allowed to embed such an absolute `ORG` block into a section. Return into relocatable mode with any new section directive. Although in Devpac compatibility mode the previous section will stay absolute.
