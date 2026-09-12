import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

// Source paths are relative to the map, so rebase them when moving a bundle.
export async function copySourceMap(source, destination) {
  const map = JSON.parse(await readFile(source + ".map", "utf8"));
  map.sources = map.sources.map((path) =>
    relative(dirname(destination), resolve(dirname(source), path)).replaceAll(
      "\\",
      "/",
    ),
  );
  await writeFile(destination + ".map", JSON.stringify(map));
}
