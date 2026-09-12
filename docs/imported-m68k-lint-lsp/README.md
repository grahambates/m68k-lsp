# m68k-lint-lsp

A language server and VS Code extension for [m68k-lint](https://github.com/grahambates/m68k-lint) —
static analysis, correctness checks and optimization hints for Motorola 68k assembly.

| Package | Published as | What it is |
| --- | --- | --- |
| [`packages/server`](packages/server) | `m68k-lint-langserver` on npm | The language server. Any LSP client can use it. |
| [`packages/client`](packages/client) | `gigabates.m68k-lint-vscode` on the VS Code Marketplace | A thin VS Code client that bundles the server. Named `-vscode` so it does not collide with the `m68k-lint` library inside this workspace. |

## What it provides

- **Diagnostics** for every enabled m68k-lint rule, with measured impact in the message
  (`Immediate 1 fits the MOVEQ signed 8-bit range (−4 bytes, −8 cycles)`).
- **Quick fixes** that apply a rule's suggested rewrite, routed through the same
  `applyOnce` the CLI's `--fix` uses, so an editor fix and a command-line fix agree.
- **Suppressions** — disable a rule for a line or a file, written as the
  `; m68k-lint-disable` comments the linter already understands.
- **Fix all** (`source.fixAll`), which runs the CLI's lint-apply-repeat loop over the document.
- **Cross-file constants**: constants a file uses but does not define are resolved by
  indexing the workspace, so rules that need a value still fire. Unsaved edits to an
  include count, so a constant resolves as soon as it is typed.

## Deliberately narrow

The server declares only `textDocumentSync`, `codeActionProvider` and diagnostics.

That is not minimalism for its own sake. Most people using this will also have
[m68k-lsp](https://github.com/grahambates/m68k-lsp) (`grahambates.m68k`) installed, which
provides hover, completion, definition, formatting, rename and the rest. Two servers on one
file is fine — it is how `eslint` and `tsserver` coexist — but only while their capabilities
do not overlap. If this server declared a formatter, VS Code would start asking users which
formatter to use; if it declared definitions, they would get a picker. So it declares neither,
and it never should.

The diagnostics genuinely complement each other: m68k-lsp reports what vasm says won't
assemble, this reports what assembles fine but is wrong, suspicious or slow.

## Configuration

A checked-in `m68k-lint.json` (or `.m68klintrc.json`) is the source of truth, found by walking
up from the file being linted. **It wins over editor settings.** The `m68kLint.defaults.*`
settings apply only where a workspace has no config file — per-user settings silently
overriding a shared config is how "works on my machine" starts.

Settings that are about the integration rather than the linting:

| Setting | Default | Meaning |
| --- | --- | --- |
| `m68kLint.enable` | `true` | Report findings at all. |
| `m68kLint.run` | `onType` | `onType` or `onSave`. |
| `m68kLint.quickFix.conditional` | `false` | Also offer fixes marked `conditional`. These rest on an assumption stated in the finding's notes — read them first. |
| `m68kLint.quickFix.annotate` | `false` | Keep the original commented above an opaque rewrite, like `--fix-annotate`. |

To fix on save, use VS Code's own mechanism:

```jsonc
"editor.codeActionsOnSave": { "source.fixAll": "explicit" }
```

## Using the server without VS Code

```sh
npm install -g m68k-lint-langserver
```

It speaks LSP over stdio (`m68k-lint-langserver --stdio`). Neovim, with `nvim-lspconfig`:

```lua
vim.lsp.config("m68k_lint", {
  cmd = { "m68k-lint-langserver", "--stdio" },
  filetypes = { "asm68k", "m68k", "asm" },
  root_markers = { "m68k-lint.json", ".m68klintrc.json", ".git" },
})
vim.lsp.enable("m68k_lint")
```

If you only want diagnostics and not quick fixes, you do not need this server at all —
`m68k-lint --format json` feeds `none-ls`, `efm-langserver` and ALE directly. Code actions are
what the server adds.

## Development

```sh
npm install
npm run watch        # rebuild both bundles on change
npm test             # builds, then drives the server over stdio
npm run typecheck
npm run lint
npm run package      # build a .vsix
```

`vsce` has to run inside `packages/client`; from the repo root it reads the workspace manifest
and fails with `Manifest missing field: engines.vscode`. `npm run package` handles that, and a
`vscode:prepublish` hook rebuilds minified first, so a `.vsix` cannot pick up the unminified
bundle that `npm test` leaves behind.

### Tests

`packages/server/test` spawns the built server as a separate process and speaks LSP to it over
stdio, rather than importing its modules. The bugs worth catching here live in the protocol
surface — which capabilities are declared, which notifications are subscribed to, and what
order initialize does things in — and none of those are reachable from a unit test.

The suite includes a guard that the server declares no provider a full 68k language server also
provides. Adding one should fail that test before it reaches a user as a duplicate formatter
prompt.

Press F5 (or run the **Extension + Server** compound) to launch an Extension Development Host
with the server debuggable on port 6019.

### Dependency on m68k-lint

`packages/server` depends on `m68k-lint` from npm (`^1.2.0`). It needs `applyOnce`,
`applyFixes`, `buildProjectSymbols` and the `m68k-lint/project-config` subpath, all of which
landed in 1.2.0 — earlier versions will not build.

The extension package is named `m68k-lint-vscode` rather than `m68k-lint` so that it does not
shadow the library of that name for the other workspace package.

## Known limitations

- The m68k-lint version is fixed at build time, bundled into the server. A workspace cannot pin
  its own. Resolving m68k-lint from the workspace, the way the ESLint extension does, is the
  obvious next step if that becomes a problem.
- The workspace symbol index is rebuilt whole when any assembly file changes. A constant's value
  can depend on expressions in another file, so there is no sound way to patch one file's entries
  back into an existing table — but it does mean a large tree re-indexes on save.
- Saving a file in VS Code lints it twice: once from `didSave`, once from the file watcher that
  invalidates the index. Harmless, but wasteful.

## License

MIT
