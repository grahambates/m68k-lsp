import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), "m68k-tools-pack-"));
const names = [
  "m68k-parser",
  "68kcounter",
  "m68k-lint",
  "m68k-formatter",
  "m68k-lsp-server",
  "m68k-lint-langserver",
];
const dependencies = {};
for (const name of names) {
  const archive = join(temp, name + ".tgz");
  execFileSync(
    "pnpm",
    ["--dir", join(root, "packages", name), "pack", "--out", archive],
    { stdio: "inherit" },
  );
  dependencies[name] = "file:" + archive;
}
writeFileSync(
  join(temp, "package.json"),
  JSON.stringify(
    { private: true, dependencies, pnpm: { overrides: dependencies } },
    null,
    2,
  ),
);
writeFileSync(
  join(temp, "pnpm-workspace.yaml"),
  JSON.stringify({ overrides: dependencies }),
);
execFileSync("pnpm", ["install", "--ignore-scripts"], {
  cwd: temp,
  stdio: "inherit",
});
writeFileSync(
  join(temp, "smoke.cjs"),
  `
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
assert.equal(typeof require('m68k-parser').parseFile, 'function');
assert.equal(typeof require('68kcounter').default, 'function');
assert.equal(require('m68k-formatter').format(' NOP'), '        nop\\n');
(async () => {
  assert.equal(typeof (await import('m68k-parser')).parseFile, 'function');
  await import('m68k-lint');
  await import('m68k-lint/project-config');
  const path = require('node:path');
  for (const name of ${JSON.stringify(names)}) {
    const fs = require('node:fs');
    const base = path.join(process.cwd(), 'node_modules', name);
    const manifest = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
    for (const bin of Object.values(manifest.bin || {})) assert.ok(fs.existsSync(path.join(base, bin)), name + ' CLI missing');
  }
  execFileSync(process.execPath, ['node_modules/m68k-parser/cli.js', '-'], {input:' nop', stdio:['pipe','ignore','inherit']});
  execFileSync(process.execPath, ['node_modules/68kcounter/dist/cli.js', '--help'], {stdio:'ignore'});
  execFileSync(process.execPath, ['node_modules/m68k-lint/dist/cli/main.js', '--help'], {stdio:'ignore'});
  console.log('Isolated package imports and CLI smoke tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
`,
);
execFileSync(process.execPath, ["smoke.cjs"], { cwd: temp, stdio: "inherit" });
console.log(`Packed artifacts and isolated consumer retained in ${temp}`);
