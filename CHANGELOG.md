# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Syntax support for escape chars in strings and unquoted paths

### Fixed

- Handle double colon for external labels in line parser
- Don't format text inside REM or after END

## [0.7.2] - 2022-06-27

### Fixed

- Parser errors on REM and empty blocks

## [0.7.0] - 2022-06-22

### Changed

- More control over standalone comment position [#5](https://github.com/grahambates/m68k-lsp/issues/5)

## [0.6.3] - 2022-06-18

### Fixed

- Handle macro arguments in labels, mnemonics, sizes and operands [#4](https://github.com/grahambates/m68k-lsp/issues/4)

## [0.6.2] - 2022-05-18

### Fixed

- Fix startup issues (in Emacs and possibly other lsp-clients) by [@themkat](https://github.com/themkat)

## [0.6.1] - 2022-05-13

### Fixed

- Replace bad wasm build

## 0.6.0 - 2022-15-12

### Added

- VASM diagnostics

### Changed

- Incremental tree-sitter updates not working correctly in neovim - disabled for now.
- Better merging of config with defaults
- Upgade tree-sitter-m68k

## [0.5.0] - 2022-05-08

### Added

- `autoExpand` option for alignment formatter. This allows automatic adjustment of component positions to allow for
  elements which exceed the available space.
- Operand spacing formatter. Add or remove space between operands as allowed in VASM with `-spaces` option.

### Changed

- Defaults for alignment now use spaces. This is more reliable as tab alignment can easily break if editor tab width
  doesn't match config.

### Fixed

- Handle string operands with spaces [@dansalvato](https://github.com/dansalvato).
