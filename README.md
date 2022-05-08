# Motorola 68000 family language server

![example workflow](https://github.com/grahambates/m68k-lsp/actions/workflows/build.yml/badge.svg)
[![npm version](https://img.shields.io/npm/v/m68k-lsp-server.svg)](https://www.npmjs.com/package/m68k-lsp-server)

[Language Server Protocol](https://github.com/Microsoft/language-server-protocol) implementation for Motorola 68000
family assembly, based on [tree-sitter-m68k](https://github.com/grahambates/tree-sitter-m68k)

- Suitable for use with other LSP supporting editors e.g. [Neovim](https://neovim.io/)
- Includes VS Code extension (not yet published)

## Features

- Auto-completion:
  - Instruction mnemonics
  - Assembler directives
  - Registers
  - Symbols
- Code Linting
  - Parser errors
  - Processor support
- Code Folding
- Document Formatting
- Document Highlights
- Document Links
- Document Symbols
- Find References
- Go to definition
- Hover
  - Instruction/directive documentation
  - Symbol info
- Multiple workspaces
- Rename Symbols
- Signature Help

## Installation

Install the package via npm:

```
npm install --global m68k-lsp-server
```

## Usage

Start the server e.g.:

```
m68k-lsp-server --stdio
```

## Configuration

The LSP client can configure the server with the following initialization options:

### Processors:

Lists the processor(s) that your code is targeted at. This controls completion suggestions and provides diagnostics.

```json
{
  "processors": ["mc68030", "mc68881"]
}
```

Default: `["mc68000"]`

Supported values:
`mc68000`
,`mc68010`
,`mc68020`
,`mc68030`
,`mc68040`
,`mc68060`
,`mc68881`
,`mc68851`
,`cpu32`

### Include Paths:

Additional paths to use to resolve include directives. This is equivalent to `INCDIR` in source. It should probably
include anything you pass to vasm `-I` arguments. Can be absolute or relative.

```json
{
  "includePaths": ["../include", "/home/myuser/includes"]
}
```

Default: `[]`

### Formatting:

The language server supports document formatting which can be configured using the following options:

#### Case

Enforce consistency of upper/lower case on elements which are normally case insensitive.

| Option  | Behaviour          |
| ------- | ------------------ |
| `upper` | Upper case         |
| `lower` | Lower case         |
| `any`   | Do not change case |

This can either be configured globally for all elements:

```json
{
  "format": {
    "case": "lower"
  }
}
```

or per element type

```json
{
  "format": {
    "case": {
      "instruction": "lower",
      "directive": "lower",
      "control": "upper",
      "sectionType": "lower",
      "register": "lower",
      "hex": "lower"
    }
  }
}
```

| Element       | Description                                           |
| ------------- | ----------------------------------------------------- |
| `instruction` | Instruction mnemonic/size e.g. `move.w`               |
| `directive`   | Assembler directive mnemonic/qualifier e.g. `include` |
| `control`     | Assembler control keywords e.g. `ifeq`/`endc`         |
| `sectionType` | Section type e.g. `bss`                               |
| `register`    | Register name e.g. `d0`,`sr`                          |
| `hex`         | Hexadecimal number literal                            |

Default: `"lower"`

#### Label colon

Determines whether labels should have a colon suffix.

Can be set for all labels:

```json
{
  "format": {
    "labelColon": "on"
  }
}
```

or individually for global and local labels:

```json
{
  "format": {
    "labelColon": {
      "global": "on",
      "local": "off"
    }
  }
}
```

| Option       | Behaviour                                             |
| ------------ | ----------------------------------------------------- |
| `on`         | Add colon                                             |
| `off`        | Remove colon                                          |
| `notInline`  | No colon for labels on same line as instruction       |
| `onlyInline` | Only add colon for labels on same line as instruction |
| `any`        | Do not change                                         |

Default: `"on"`

#### Operand space

Include space between operands e.g. ` move d0, d1`. VASM needs `-spaces` or `-phxass` option to support this.

| Option | Behaviour     |
| ------ | ------------- |
| `on`   | Add space     |
| `off`  | Remove space  |
| `any`  | Do not change |

Default: `"on"`

#### Quotes

Quote style to use for strings and paths.

```json
{
  "format": {
    "quotes": "single"
  }
}
```

| Option   | Behaviour          |
| -------- | ------------------ |
| `single` | Single quotes: `'` |
| `double` | Double quotes: `"` |
| `any`    | Do not change      |

Default: `"double"`

#### Align

Indents elements to align by type.

```json
{
  "format": {
    "align": {
      "mnemonic": 12,
      "operands": 22,
      "comment": 48,
      "operator": 0,
      "value": 0,
      "indentStyle": "space",
      "tabSize": 8
      "autoExtend": "line"
    }
  }
}
```

(defaults)

| Property      | Description                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `mnemonic`    | Position of instruction/directive mnemonic and size e.g. `move.w`,`include`.                            |
| `operands`    | Position of operands e.g. `d0,d1`.                                                                      |
| `comment`     | Position of comment following statement. Comments on their own line are not affected.                   |
| `operator`    | Position of `=` character in constant assignment                                                        |
| `value`       | Position of value in constant assignment                                                                |
| `indentStyle` | Character to use for indent - `tab` or `space`. Values for the properties above are based on this unit. |
| `tabSize`     | Width of tab character to calculate positions when using `tab` indent style.                            |
| `autoExtend`  | Behaviour when a component exceeds the available space between positions. See below.                    |

Options for `autoExtend`:

| Option  | Behaviour                                                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `line`  | Adjust the position for the affected line only                                                                                |
| `block` | Adjust the position, maintaining alignment for all lines within the same block i.e. code separated by two or more line breaks |
| `file`  | Adjust the position, maintaining alignment for all lines in the source file                                                   |

#### Trim whitespace

Remove trailing whitespace from lines?

```json
{
  "format": {
    "trimWhitespace": true
  }
}
```

default: `true`

### Final new line

Require line break on final line?

```json
{
  "format": {
    "finalNewLine": true
  }
}
```

### End-of-line character

New line type: `lf`, `cr`, `crlf`

```json
{
  "format": {
    "endOfLine": "lf"
  }
}
```

default: `lf`

## TODO

- Full documentation for 68010+ instructions
- Diagnostics
  - Instruction signatures
- Amiga or other platform specific docs?

## License

This project is made available under the MIT License.
