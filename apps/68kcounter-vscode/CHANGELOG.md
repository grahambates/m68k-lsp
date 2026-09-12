# Change Log

All notable changes to the "68k-counter" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [Unreleased]

## [1.1.2] - 2021-07-05

### Fixed

- Remove 'after' decorator which was affecting cursor position

## [1.1.1] - 2021-06-30

### Fixed

- Debounce updates for improved performance
- Handle single quoted strings

## [1.1.0] - 2021-06-30

### Added

- Calculation tooltips
- Macro and repeat processing
- Improved variable and expression interpreting
- Block byte counts

### Changed

- Sizes now in bytes, not words

### Fixed

- #1 Performance issue toggling timings
- #2 Issues switching between editors
- Inaccurate timings and missing instructions https://github.com/grahambates/68kcounter/issues/2

## [1.0.0] - 2021-04-11

- Initial release
