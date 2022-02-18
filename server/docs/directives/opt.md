# OPT - Option control

## Syntax
```assembly
OPT <option>[,<option>...]
```

## Description
Sets Devpac-compatible options. When option `-phxass` is given, then it will parse PhxAss options instead (which is discouraged for new code, so there is no detailed description here). Most supported Devpac2-style options are always suffixed by a `+` or `-` to enable or disable the option:

Option|Description
:-----|:----------
`a`|Automatically optimize absolute to PC-relative references. Default is off in Devpac-comptability mode, otherwise on.
`c`|Case-sensitivity for all symbols, instructions and macros. Default is on.
`d`|Include all symbols for debugging in the output file. May also generate line debugging information in some output formats. Default is off in Devpac-comptability mode, otherwise on.
`l`|Generate a linkable object file. The default is defined by the selected output format via the assembler’s `-F` option. This option was supported by Devpac-Amiga only.
`o`|Enable all optimizations (`o1` to `o12`), or disable all optimizations. The default is that all are disabled in Devpac-compatibility mode and enabled otherwise. When running in native vasm mode this option will also enable PC-relative (`opt a`) and the following safe vasm-specific optimizations (see below): `og`, `of`.
`o1`|Optimize branches without an explicit size extension.
`o2`|Standard displacement optimizations (e.g. `(0,An) -> (An)`).
`o3`|Optimize absolute addresses to short words.
`o4`|Optimize `move.l` to `moveq`.
`o5`|Optimize `add #x` and `sub #x` into their quick forms.
`o6`|No effect in vasm.
`o7`|Convert bra.b to nop, when branching to the next instruction.
`o8`|Optimize 68020+ base displacements to 16 bit.
`o9`|Optimize 68020+ outer displacements to 16 bit.
`o10`|Optimize `add`/`sub` `#x,An` to `lea`.
`o11`|Optimize `lea (d,An),An` to `addq`/`subq`.
`o12`|Optimize `<op>.l #x,An` to `<op>.w #x,An`.
`ow`|Show all optimizations being peformed. Default is on in Devpac-compatibility mode, otherwise off.
`p`|Check if code is position independant. This will cause an error on each relocation being required. Default is off.
`s`|Include symbols in listing file. Default is on.
`t`|Check size and type of all expressions. Default is on.
`w`|Show assembler warnings. Default is on.
`x`|For Amiga hunk format objects `x+` strips local symbols from the symbol table (symbols without `xdef`). For Atari TOS executables this will enable the extended (HiSoft) DRI symbol table format, which allows symbols with up to 22 characters. DRI standard only supports 8 characters.

Devpac options without +/- suffix:

Option|Description
:-----|:----------
`l<n>`|Sets the output format (Devpac Atari only). Currently without effect.
`p=<type>[/<type>]`|Sets the CPU type to any model vasm supports (original Devpac only allowed 68000-68040, 68332, 68881, 68882 and 68851).

Also the following Devpac3-style options are supported:

Option|Description
:-----|:----------
`autopc`|Corresponds to `a+`.
`case`|Corresponds to `c+`.
`chkpc`|Corresponds to `p+`.
`debug`|Corresponds to `d+`.
`symtab`|Corresponds to `s+`.
`type`|Corresponds to `t+`.
`warn`|Corresponds to `w+`.
`xdebug`|Corresponds to `x+`.
`noautopc`|Corresponds to `a-`.
`nocase`|Corresponds to `c-`.
`nochkpc`|Corresponds to `p-`.
`nodebug`|Corresponds to `d-`.
`nosymtab`|Corresponds to `s-`.
`notype`|Corresponds to `t-`.
`nowarn`|Corresponds to `w-`.
`noxdebug`|Corresponds to `x-`.

The following options are vasm specific and should not be used when writing portable source. Using `opt o+` or `opt o-` in Devpac mode only toggles `og`, `of` and `oj`.

Option|Description
:-----|:----------
`ob`|Convert absolute jumps to external labels into long-branches (refer to `-opt-jbra`).
`oc`|Enable optimizations to CLR (refer to `-opt-clr`).
`od`|Enable optimization of divisions into shifts (refer to `-opt-div`).
`of`|Enable immediate float constant optimizations (refer to `-opt-fconst`).
`og`|Enable generic vasm optimizations. All optimizations which cannot be controlled by another option.
`oj`|Enable branch to jump translations (refer to `-opt-brajmp`).
`ol`|Enable shift optimizations to ADD (refer to `-opt-lsl`).
`om`|Enable MOVEM optimizations (refer to `-opt-movem`).
`on`|Enable small data optimizations. References to absolute symbols in a small data section (named "MERGED") are optimized into a base-relative addressing mode (refer to `-sd`).
`op`|Enable optimizations to `PEA` (refer to `-opt-pea`).
`oq`|Optimizes `MOVE.L` into a combination of `MOVEQ` and `NEG.W` (refer to `-opt-nmoveq`).
`os`|Optimize for speed before optimizing for size (refer to `-opt-speed`).
`ot`|Enable optimizations to ST (refer to `-opt-st`).
`ox`|Enable optimization of multiplications into shifts (refer to `-opt-mul`).
`oz`|Enable optimization for size, even if the code becomes slower (refer to `-opt-size`).

The default state is ’off’ for all those vasm specific options.