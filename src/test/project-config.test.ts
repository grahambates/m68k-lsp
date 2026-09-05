import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findProjectConfig, loadProjectConfig } from "../cli/project-config.js";

describe("project config", () => {
  test("finds config walking upward", async () => {
    const root = await mkdtemp(join(tmpdir(), "m68k-lint-config-"));
    const nested = join(root, "a", "b");
    await mkdir(nested, { recursive: true });
    const config = join(root, "m68k-lint.json");
    await writeFile(config, JSON.stringify({ platform: "amiga" }));
    expect(await findProjectConfig(nested)).toBe(config);
  });

  test("loads lint and discovery settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "m68k-lint-config-load-"));
    const config = join(root, ".m68klintrc.json");
    await writeFile(
      config,
      JSON.stringify({
        processors: ["mc68000"],
        platform: "amiga",
        goal: "speed",
        extensions: [".s", ".i"],
        ignorePatterns: ["generated/**"],
        inlineConfig: false,
        presets: ["style"],
        rules: { "suspicious/nop": "warning" },
      }),
    );
    const loaded = await loadProjectConfig(config);
    expect(loaded.platform).toBe("amiga");
    expect(loaded.goal).toBe("speed");
    expect(loaded.rules?.["suspicious/nop"]).toBe("warning");
    expect(loaded.inlineConfig).toBe(false);
    expect(loaded.presets).toEqual(["style"]);
  });
});
