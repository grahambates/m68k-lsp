import * as lsp from "vscode-languageserver";
import { FileOperationFilter } from "vscode-languageserver-protocol/lib/common/protocol.fileOperations";
import { basename } from "path";

import { Provider } from ".";
import { Context } from "../context";
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
        this.ctx.store.set(file.newUri, processed);
        this.ctx.store.delete(file.oldUri);
        // Replace TextDocument with correct uri
        const { languageId, version } = processed.document;
        processed.document = TextDocument.create(
          file.newUri,
          languageId,
          version,
          processed.document.getText()
        );
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
            const separator = oldUri.endsWith("/") ? "" : "/";
            return {
              oldUri: oldUri + separator + basename(fileUrl.toString()),
              newUri: fileUrl.toString(),
            };
          });
        }

        return { oldUri, newUri };
      })
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
