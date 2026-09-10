import * as lsp from "vscode-languageserver";
import { FileOperationFilter } from "vscode-languageserver-protocol/lib/common/protocol.fileOperations";
import { Definition, Symbols } from "../symbols";

import { Provider } from ".";
import { Context } from "../context";
import { isProcessed } from "../DocumentProcessor";
import { getAsmFilesInDir, isAsmExt, isDir } from "../files";
import { TextDocument } from "vscode-languageserver-textdocument";

export default class FileOperationsProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  private fileDeletesMap: Map<string, Set<string>> = new Map();

  async onWillDeleteFiles({ files }: lsp.DeleteFilesParams): Promise<null> {
    for (const { uri } of files) {
      let fileDeletes = this.fileDeletesMap.get(uri);
      if (!fileDeletes) {
        fileDeletes = new Set<string>();
        this.fileDeletesMap.set(uri, fileDeletes);
      }

      if (await isDir(uri)) {
        for (const childUri of await getAsmFilesInDir(uri)) {
          fileDeletes.add(childUri);
        }
      } else if (isAsmExt(uri)) {
        fileDeletes.add(uri);
      }
    }
    return null;
  }

  onDidDeleteFiles({ files }: lsp.DeleteFilesParams): null {
    for (const { uri } of files) {
      const fileDeletes = this.fileDeletesMap.get(uri);
      if (fileDeletes) {
        for (const deleteUri of fileDeletes) {
          // Delete from store
          this.ctx.store.delete(deleteUri);

          // Find referencing docs
          for (const processedDoc of this.ctx.store.values()) {
            const refIndex = processedDoc.referencedUris.indexOf(deleteUri);
            // Remove reference
            if (refIndex !== -1) {
              delete processedDoc.referencedUris[refIndex];
            }
          }
        }

        this.fileDeletesMap.delete(uri);
      }
    }
    return null;
  }

  async onDidRenameFiles({ files }: lsp.RenameFilesParams): Promise<null> {
    const fileRenames = await this.adaptFolderRenames(files);

    for (const file of fileRenames) {
      this.ctx.logger.info(`renaming ${file.oldUri} to ${file.newUri}`);
      const processed = this.ctx.store.get(file.oldUri);
      if (processed) {
        processed.uri = file.newUri;
        relocateSymbols(processed.symbols, file.newUri);
        this.ctx.store.set(file.newUri, processed);
        this.ctx.store.delete(file.oldUri);
        // Replace TextDocument with correct uri
        if (isProcessed(processed)) {
          const { languageId, version } = processed.document;
          processed.document = TextDocument.create(
            file.newUri,
            languageId,
            version,
            processed.document.getText(),
          );
        }
      }

      // Update referenced URIs
      for (const processedDoc of this.ctx.store.values()) {
        const refIndex = processedDoc.referencedUris.indexOf(file.oldUri);
        if (refIndex !== -1) {
          processedDoc.referencedUris[refIndex] = file.newUri;
          // TODO: update include directives in referencing file
        }
      }
    }

    return null;
  }

  /**
   * Adapt folder renames to file renames
   */
  async adaptFolderRenames(files: lsp.FileRename[]): Promise<lsp.FileRename[]> {
    const renames = await Promise.all(
      files.map(async ({ oldUri, newUri }) => {
        if (await isDir(newUri)) {
          const filesInDir = await getAsmFilesInDir(newUri);
          return filesInDir.map((fileUrl) => {
            const oldPrefix = oldUri.replace(/\/$/, "");
            const newPrefix = newUri.replace(/\/$/, "");
            return {
              oldUri: oldPrefix + fileUrl.slice(newPrefix.length),
              newUri: fileUrl.toString(),
            };
          });
        }

        return { oldUri, newUri };
      }),
    );
    return renames.flat().filter(({ newUri }) => isAsmExt(newUri));
  }

  register(connection: lsp.Connection): lsp.ServerCapabilities {
    connection.workspace.onWillDeleteFiles(this.onWillDeleteFiles.bind(this));
    connection.workspace.onDidDeleteFiles(this.onDidDeleteFiles.bind(this));
    connection.workspace.onDidRenameFiles(this.onDidRenameFiles.bind(this));

    const fileOperationFilter: FileOperationFilter = {
      pattern: {
        glob: "**/*.{s,i,asm}",
        options: { ignoreCase: true },
      },
    };

    const folderOperationFilter: FileOperationFilter = {
      pattern: {
        glob: "**/*",
      },
    };

    return {
      workspace: {
        fileOperations: {
          willDelete: {
            filters: [fileOperationFilter, folderOperationFilter],
          },
          didDelete: {
            filters: [fileOperationFilter, folderOperationFilter],
          },
          didCreate: {
            filters: [fileOperationFilter],
          },
          didRename: {
            filters: [fileOperationFilter, folderOperationFilter],
          },
        },
      },
    };
  }
}

/** Symbol ranges stay valid across a rename, including unsaved editor text. */
function relocateSymbols(symbols: Symbols, uri: string): void {
  const relocateDefinition = (definition: Definition) => {
    definition.location.uri = uri;
    for (const local of definition.locals?.values() ?? []) {
      relocateDefinition(local);
    }
  };
  for (const definition of symbols.definitions.values()) {
    relocateDefinition(definition);
  }
  for (const references of symbols.references.values()) {
    for (const reference of references) {
      reference.location.uri = uri;
    }
  }
  for (const literal of [...symbols.includes, ...symbols.incDirs]) {
    literal.location.uri = uri;
  }
}
