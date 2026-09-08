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
    () => false,
  );
}

export async function readDocumentFromUri(
  uri: string,
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
  ctx: ResolveContext,
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
  ctx: ResolveContext,
): AsyncGenerator<string> {
  const roots = ctx.workspaceFolders.map((f) => URI.parse(f.uri).fsPath);
  roots.push(dirname(URI.parse(documentUri).fsPath));

  // Only incdirs the document can actually see: its own and those of the
  // files it includes. Pooling them across the whole store let an incdir in
  // one part of a workspace change how another part resolves its includes.
  const visible = [documentUri, ...getIncluded(documentUri, ctx)];
  const incDirs = visible
    .flatMap((uri) => ctx.store.get(uri)?.symbols.incDirs ?? [])
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
  ctx: ResolveContext,
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
      }),
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
 * URIs a document includes, directly or through further includes.
 *
 * These are the files whose symbols are visible to it: including a file
 * brings its text, and so its definitions, into the including one.
 */
export function getIncluded(
  documentUri: string,
  ctx: ResolveContext,
): string[] {
  const result = new Set<string>();

  const visit = (uri: string) => {
    for (const next of ctx.store.get(uri)?.referencedUris ?? []) {
      if (!result.has(next)) {
        result.add(next);
        visit(next);
      }
    }
  };
  visit(documentUri);

  result.delete(documentUri);
  return Array.from(result);
}

/**
 * URIs that include a document, directly or through further includes.
 *
 * These are the files the document's own symbols are visible to, which is
 * where references to something it defines can appear.
 *
 * Kept separate from `getIncluded` on purpose. Following both directions at
 * once reaches every file sharing any include: two entry points that both
 * include a hardware definitions file would see each other's symbols, and a
 * rename in one would edit the other.
 */
export function getIncluders(
  documentUri: string,
  ctx: ResolveContext,
): string[] {
  const includers = new Map<string, string[]>();
  for (const [uri, processed] of ctx.store) {
    for (const included of processed.referencedUris) {
      const list = includers.get(included);
      if (list) {
        list.push(uri);
      } else {
        includers.set(included, [uri]);
      }
    }
  }

  const result = new Set<string>();
  const visit = (uri: string) => {
    for (const next of includers.get(uri) ?? []) {
      if (!result.has(next)) {
        result.add(next);
        visit(next);
      }
    }
  };
  visit(documentUri);

  result.delete(documentUri);
  return Array.from(result);
}

/**
 * URIs sharing an assembly unit with a document.
 *
 * An assembler splices includes into the file that pulls them in, so every
 * file in one of those trees shares a single namespace: a symbol defined in
 * any of them is visible in all of them, including in a file the definition's
 * own file includes.
 *
 * The trees a document belongs to are found from the files that include it,
 * and the rest of each tree from what those files include in turn. Only the
 * document itself is followed upwards. Following the upward edge from files
 * reached on the way down is what used to merge separate entry points that
 * happened to share a header, since it climbed out of one tree and back down
 * into another.
 */
export function getUnitFiles(
  documentUri: string,
  ctx: ResolveContext,
): string[] {
  const result = new Set<string>([documentUri]);

  for (const root of [documentUri, ...getIncluders(documentUri, ctx)]) {
    result.add(root);
    for (const included of getIncluded(root, ctx)) {
      result.add(included);
    }
  }

  result.delete(documentUri);
  return Array.from(result);
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
