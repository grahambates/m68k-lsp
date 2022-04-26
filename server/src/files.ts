import { TextDocument } from "vscode-languageserver-textdocument";
import { URI } from "vscode-uri";
import { constants, promises as fsp } from "fs";
import { extname, resolve } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

import { Context } from "./context";

const { readFile, access } = fsp;

export async function exists(filePath: string): Promise<boolean> {
  return access(filePath).then(
    () => true,
    () => false
  );
}

export async function readDocumentFromUri(
  uri: string
): Promise<TextDocument | null> {
  let content: string;

  try {
    content = await readFile(fileURLToPath(uri), "utf8");
  } catch (err) {
    return null;
  }

  return TextDocument.create(uri, "vasmmot", 0, content);
}

type ResolveContext = Pick<Context, "workspaceFolders" | "store" | "config">;

/**
 * Resolve include file/dir path to first matching absolute file path.
 */
export async function resolveInclude(
  documentUri: string,
  path: string,
  ctx: ResolveContext
): Promise<string | undefined> {
  for await (const resolved of resolveIncludesGen(documentUri, path, ctx)) {
    return resolved;
  }
}

/**
 * Resolve include file/dir path to all possible file paths
 *
 * Returns full files paths which exist relative to incdirs and current document.
 */
export async function* resolveIncludesGen(
  documentUri: string,
  path: string | undefined,
  ctx: ResolveContext
): AsyncGenerator<string> {
  const roots = ctx.workspaceFolders.map((f) => URI.parse(f.uri).fsPath);
  roots.push(dirname(URI.parse(documentUri).fsPath));

  const incDirs = Array.from(ctx.store.values())
    .flatMap((v) => v.symbols.incDirs)
    .map((dir) => dir.text);

  if (ctx.config.includePaths) {
    incDirs.push(...ctx.config.includePaths);
  }

  for (const root of roots) {
    const candidate = path ? resolve(root, path) : root;
    if (await exists(candidate)) {
      yield candidate;
    }
    for (const dir of incDirs) {
      const candidate = path ? resolve(root, dir, path) : root;
      if (await exists(candidate)) {
        yield candidate;
      }
    }
  }
}

/**
 * Get array of URIs referenced in document
 */
export async function resolveReferencedUris(
  documentUri: string,
  ctx: ResolveContext
): Promise<string[]> {
  const uris = new Set<string>();
  const docSymbols = ctx.store.get(documentUri)?.symbols;
  if (docSymbols) {
    await Promise.all(
      docSymbols.includes.map(async (path) => {
        const resolved = await resolveInclude(documentUri, path.text, ctx);
        if (resolved) {
          uris.add(URI.file(resolved).toString());
        }
      })
    );
  }
  return Array.from(uris);
}

/**
 * Check whether file extension is ASM source file
 */
export function isAsmExt(filename: string): boolean {
  return [".asm", ".s", ".i"].includes(extname(filename).toLowerCase());
}

/**
 * Get the containing directory of a file path
 *
 * For directories or non-existent return original path
 */
export async function getDirectory(path: string): Promise<string> {
  try {
    const stats = await fsp.stat(path);
    if (!stats.isDirectory()) {
      return dirname(path);
    }
  } catch (_) {
    return dirname(path);
  }
  return path;
}

/**
 * Get URIs of referenced source files.
 */
export async function getDependencies(
  documentUri: string,
  ctx: ResolveContext
): Promise<string[]> {
  const deps = await addDependencies(documentUri, ctx, new Set());
  deps.delete(documentUri);
  return Array.from(deps);
}

async function addDependencies(
  documentUri: string,
  ctx: ResolveContext,
  result: Set<string>
) {
  const referenced = ctx.store.get(documentUri)?.referencedUris ?? [];
  const referencing = [...ctx.store.keys()].filter((uri) =>
    ctx.store.get(uri)?.referencedUris.includes(documentUri)
  );

  const newUris = [...referenced, ...referencing].filter(
    (uri) => !result.has(uri)
  );

  for (const uri of newUris) {
    result.add(uri);
    await addDependencies(uri, ctx, result);
  }

  return result;
}

export async function getAsmFilesInDir(uri: string): Promise<string[]> {
  const result: string[] = [];
  const url = new URL(uri);

  try {
    await fsp.access(url, constants.R_OK);
  } catch (_err) {
    return [];
  }

  for (const dirent of await fsp.readdir(url, { withFileTypes: true })) {
    const childUri = `${uri}/${dirent.name}`;
    if (isAsmExt(dirent.name)) {
      result.push(childUri);
    } else if (dirent.isDirectory()) {
      const inDir = await getAsmFilesInDir(childUri);
      result.push(...inDir);
    }
  }

  return result;
}

export async function isDir(uri: string): Promise<boolean> {
  return (await fsp.stat(new URL(uri))).isDirectory();
}
