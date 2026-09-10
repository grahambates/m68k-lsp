import * as path from "path";
import {
  DecorationRangeBehavior,
  ExtensionContext,
  Range,
  TextEditor,
  commands,
  window,
  workspace,
} from "vscode";

import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

const registerColours = new Map([
  ["d0", "#e06c75"],
  ["d1", "#d19a66"],
  ["d2", "#e5c07b"],
  ["d3", "#98c379"],
  ["d4", "#56b6c2"],
  ["d5", "#61afef"],
  ["d6", "#c678dd"],
  ["d7", "#be5046"],
  ["a0", "#f06c9b"],
  ["a1", "#f5a97f"],
  ["a2", "#f2cc8f"],
  ["a3", "#a8d08d"],
  ["a4", "#78c4c4"],
  ["a5", "#7aa2f7"],
  ["a6", "#b48ead"],
  ["a7", "#d08770"],
  ["sp", "#ff7ab2"],
  ["pc", "#ff9e64"],
  ["sr", "#e0af68"],
  ["ccr", "#9ece6a"],
  ["usp", "#2ac3de"],
  ["ssp", "#7dcfff"],
  ["vbr", "#bb9af7"],
  ["sfc", "#f7768e"],
  ["dfc", "#ff9e64"],
  ["cacr", "#e0af68"],
  ["caar", "#9ece6a"],
  ["fp0", "#2ac3de"],
  ["fp1", "#7dcfff"],
  ["fp2", "#7aa2f7"],
  ["fp3", "#bb9af7"],
  ["fp4", "#f7768e"],
  ["fp5", "#ff9e64"],
  ["fp6", "#e0af68"],
  ["fp7", "#9ece6a"],
  ["fpcr", "#2ac3de"],
  ["fpsr", "#7dcfff"],
  ["fpiar", "#7aa2f7"],
]);

export function activate(context: ExtensionContext): void {
  const decorations = new Map(
    Array.from(registerColours, ([register, color]) => [
      register,
      window.createTextEditorDecorationType({
        color,
        rangeBehavior: DecorationRangeBehavior.ClosedClosed,
      }),
    ]),
  );
  let enabled = workspace
    .getConfiguration("m68k.registerColours")
    .get<boolean>("enabled", false);

  const clearDecorations = (editor: TextEditor) => {
    for (const decoration of decorations.values()) {
      editor.setDecorations(decoration, []);
    }
  };

  const applyDecorations = async (editor: TextEditor) => {
    if (!enabled) {
      clearDecorations(editor);
      return;
    }

    const ranges = await client.sendRequest<Record<string, Range[]>>(
      "m68k/registerRanges",
      { uri: editor.document.uri.toString() },
    );
    for (const [register, decoration] of decorations) {
      editor.setDecorations(decoration, ranges[register] ?? []);
    }
  };

  const refresh = () => {
    for (const editor of window.visibleTextEditors) {
      if (
        editor.document.languageId === "m68k" ||
        editor.document.languageId === "vasmmot"
      ) {
        void applyDecorations(editor);
      }
    }
  };

  context.subscriptions.push(
    ...decorations.values(),
    window.onDidChangeActiveTextEditor(refresh),
    window.onDidChangeVisibleTextEditors(refresh),
    workspace.onDidChangeTextDocument(({ document }) => {
      const editor = window.visibleTextEditors.find(
        ({ document: visible }) =>
          visible.uri.toString() === document.uri.toString(),
      );
      if (editor) {
        void applyDecorations(editor);
      }
    }),
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("m68k.registerColours.enabled")) {
        enabled = workspace
          .getConfiguration("m68k.registerColours")
          .get<boolean>("enabled", false);
        refresh();
      }
    }),
    commands.registerCommand("m68k.toggleRegisterColours", () => {
      enabled = !enabled;
      refresh();
    }),
  );

  // The server bundle is copied next to the extension at build time, so the
  // packaged extension carries no node_modules of its own.
  const serverModule = context.asAbsolutePath(
    process.env["M68K_SERVER_PATH"] || path.join("out", "server.js"),
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
    clientOptions,
  );

  void client.start().then(refresh);
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
