import * as path from "path";
import { ConfigurationTarget, ExtensionContext, workspace } from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(context: ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    process.env["M68K_SERVER_PATH"] ||
      path.join("node_modules", "m68k-lsp-server", "out", "server.js")
  );
  // The debug options for the server
  // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging
  const debugOptions = { execArgv: ["--nolazy", "--inspect=6009"] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: debugOptions,
    },
  };

  const config = workspace.getConfiguration("m68k");

  updateRulers();
  workspace.onDidChangeConfiguration((e) => {
    if (
      e.affectsConfiguration("m68k.format.align") ||
      e.affectsConfiguration("m68k.rulers")
    ) {
      updateRulers();
    }
  });

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "vasmmot" },
      { scheme: "file", language: "m68k" },
    ],
    synchronize: {},
    initializationOptions: {
      ...config,
    },
  };

  client = new LanguageClient(
    "m68k",
    "Motorola 68000 Assembly",
    serverOptions,
    clientOptions
  );

  client.start();
}

function updateRulers() {
  const config = workspace.getConfiguration("m68k");
  const { mnemonic, operands, comment } = config.format.align;
  const rulers = config.rulers
    ? [mnemonic, operands, comment].filter((v) => v > 0)
    : [];
  workspace
    .getConfiguration("", { languageId: "m68k" })
    .update("editor.rulers", rulers, ConfigurationTarget.Workspace, true);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
