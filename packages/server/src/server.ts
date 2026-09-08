import { createConnection } from "vscode-languageserver/node";
import * as lsp from "vscode-languageserver";

import DocumentProcessor from "./DocumentProcessor";
import registerProviders from "./providers";
import { createContext } from "./context";
import { indexWorkspace } from "./workspace";

const connection = createConnection(lsp.ProposedFeatures.all);

connection.onInitialize(async (params) => {
  const ctx = await createContext(
    params.workspaceFolders ?? [],
    connection.console,
    connection,
    params.initializationOptions,
  );

  const capabilities = registerProviders(connection, ctx, params.capabilities);

  // Index the workspace in the background. Symbol resolution is only as
  // complete as the set of files it knows about, and waiting for it would
  // delay the first response for no benefit: requests arriving meanwhile see
  // whatever is indexed so far.
  connection.onInitialized(() => {
    void indexWorkspace(ctx, new DocumentProcessor(ctx)).catch((err) => {
      ctx.logger.error(`Workspace indexing failed: ${String(err)}`);
    });
  });

  return { capabilities };
});

// Listen on the connection
connection.listen();

export default connection;
