import * as path from "path";
import {
  DecorationRangeBehavior,
  ExtensionContext,
  QuickPickItem,
  QuickPickItemKind,
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

interface RegisterUsageResult {
  documentVersion: number;
  registers: Array<{
    name: string;
    read: boolean;
    written: boolean;
    input?: boolean;
  }>;
}

interface RegisterSwapResult {
  documentVersion: number;
  edits: Array<{ range: Range; newText: string }>;
  error?: "invalid-registers" | "stale-document" | "unsupported-reference";
  unsupported?: Array<{
    kind: "explicit" | "register-list" | "macro-expansion";
  }>;
}

const generalPurposeRegisters = [
  "d0",
  "d1",
  "d2",
  "d3",
  "d4",
  "d5",
  "d6",
  "d7",
  "a0",
  "a1",
  "a2",
  "a3",
  "a4",
  "a5",
  "a6",
  "a7",
];

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

  const listRegistersInSelection = async () => {
    const editor = window.activeTextEditor;
    if (!editor || !["m68k", "vasmmot"].includes(editor.document.languageId)) {
      void window.showWarningMessage("Open an M68k assembly file first.");
      return;
    }
    const range = await registerCommandRange(editor);
    if (!range) {
      return;
    }

    const usage = await client.sendRequest<RegisterUsageResult | undefined>(
      "m68k/registerUsage",
      {
        textDocument: { uri: editor.document.uri.toString() },
        range,
      },
    );
    const usageByName = new Map(
      usage?.registers.map((register) => [register.name, register]),
    );

    const usedRegisters = generalPurposeRegisters.filter((register) =>
      usageByName.has(register),
    );
    const unusedRegisters = generalPurposeRegisters.filter(
      (register) => !usageByName.has(register),
    );
    const items: QuickPickItem[] = [
      {
        label: `Used (${usedRegisters.length})`,
        kind: QuickPickItemKind.Separator,
      },
      ...usedRegisters.map((register) =>
        registerItem(register, usageByName.get(register)),
      ),
      {
        label: `Unused (${unusedRegisters.length})`,
        kind: QuickPickItemKind.Separator,
      },
      ...unusedRegisters.map((register) => registerItem(register)),
    ];
    await window.showQuickPick(items, {
      title: "M68k Registers",
      placeHolder: `${usedRegisters.length} used, ${unusedRegisters.length} unused`,
    });
  };

  const swapRegistersInSelection = async () => {
    const editor = window.activeTextEditor;
    if (!editor || !["m68k", "vasmmot"].includes(editor.document.languageId)) {
      void window.showWarningMessage("Open an M68k assembly file first.");
      return;
    }
    const range = await registerCommandRange(editor);
    if (!range) {
      return;
    }

    const usage = await client.sendRequest<RegisterUsageResult | undefined>(
      "m68k/registerUsage",
      {
        textDocument: { uri: editor.document.uri.toString() },
        range,
      },
    );
    const used = usage?.registers ?? [];
    if (!used.length) {
      void window.showWarningMessage(
        "The selection does not use any general-purpose registers.",
      );
      return;
    }

    const first =
      used.length === 1
        ? used[0].name
        : await pickRegister("Select the source register", used);
    if (!first) {
      return;
    }
    const usageByName = new Map(used.map((item) => [item.name, item]));
    const second = await pickDestinationRegister(first, usageByName);
    if (!second) {
      return;
    }
    const pair: [string, string] = [first, second];

    const planned = await client.sendRequest<RegisterSwapResult | undefined>(
      "m68k/registerSwap",
      {
        textDocument: { uri: editor.document.uri.toString() },
        documentVersion: usage!.documentVersion,
        range,
        registers: pair,
      },
    );
    if (!planned) {
      void window.showErrorMessage("Register swap analysis is unavailable.");
      return;
    }
    if (planned.error === "stale-document") {
      void window.showWarningMessage(
        "The document changed during analysis. Run the command again.",
      );
      return;
    }
    if (planned.error === "unsupported-reference") {
      const kinds = Array.from(
        new Set(planned.unsupported?.map(({ kind }) => kind)),
      ).join(", ");
      void window.showWarningMessage(
        `This swap includes references that cannot be edited safely yet${kinds ? `: ${kinds}` : "."}`,
      );
      return;
    }
    if (planned.error || !planned.edits.length) {
      void window.showWarningMessage("No safe register swap was found.");
      return;
    }

    const destinationIsUsed = usageByName.has(second);
    const action = destinationIsUsed
      ? `Swap ${first.toUpperCase()} and ${second.toUpperCase()}`
      : `Replace ${first.toUpperCase()} with ${second.toUpperCase()}`;
    const confirmation = await window.showWarningMessage(
      `${action} in ${planned.edits.length} places?`,
      { modal: true },
      "Swap",
    );
    if (confirmation !== "Swap") {
      return;
    }
    if (editor.document.version !== planned.documentVersion) {
      void window.showWarningMessage(
        "The document changed during analysis. Run the command again.",
      );
      return;
    }

    const applied = await editor.edit((edit) => {
      for (const replacement of planned.edits) {
        const { start, end } = replacement.range;
        edit.replace(
          new Range(start.line, start.character, end.line, end.character),
          replacement.newText,
        );
      }
    });
    if (!applied) {
      void window.showErrorMessage("Unable to apply the register swap.");
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
    commands.registerCommand(
      "m68k.listRegistersInSelection",
      listRegistersInSelection,
    ),
    commands.registerCommand(
      "m68k.swapRegistersInSelection",
      swapRegistersInSelection,
    ),
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

function registerItem(
  register: string,
  usage?: RegisterUsageResult["registers"][number],
): QuickPickItem {
  if (!usage) {
    return { label: register.toUpperCase() };
  }
  const access =
    usage.read && usage.written
      ? "read/write"
      : usage.read
        ? "read"
        : usage.written
          ? "write"
          : "access unknown";
  return {
    label: register.toUpperCase(),
    description: usage.input ? `${access}, input` : access,
  };
}

async function pickRegister(
  title: string,
  registers: RegisterUsageResult["registers"],
): Promise<string | undefined> {
  const picked = await window.showQuickPick(
    registers.map((usage) => ({
      ...registerItem(usage.name, usage),
      register: usage.name,
    })),
    { title },
  );
  return picked?.register;
}

async function registerCommandRange(
  editor: TextEditor,
): Promise<Range | undefined> {
  if (!editor.selection.isEmpty) {
    return editor.selection;
  }
  const range = await client.sendRequest<Range | undefined>(
    "m68k/routineRange",
    {
      textDocument: { uri: editor.document.uri.toString() },
      position: editor.selection.active,
    },
  );
  if (!range) {
    void window.showWarningMessage(
      "Could not find a preceding non-local label and following RTS.",
    );
  }
  return range;
}

async function pickDestinationRegister(
  source: string,
  usageByName: Map<string, RegisterUsageResult["registers"][number]>,
): Promise<string | undefined> {
  const available = generalPurposeRegisters.filter(
    (register) => register !== source,
  );
  const used = available.filter((register) => usageByName.has(register));
  const unused = available.filter((register) => !usageByName.has(register));
  const picked = await window.showQuickPick(
    [
      {
        label: `Used (${used.length})`,
        kind: QuickPickItemKind.Separator,
      },
      ...used.map((register) => ({
        ...registerItem(register, usageByName.get(register)),
        register,
      })),
      {
        label: `Unused (${unused.length})`,
        kind: QuickPickItemKind.Separator,
      },
      ...unused.map((register) => ({
        ...registerItem(register),
        register,
      })),
    ],
    {
      title: `Select the destination for ${source.toUpperCase()}`,
    },
  );
  return picked && "register" in picked ? picked.register : undefined;
}
