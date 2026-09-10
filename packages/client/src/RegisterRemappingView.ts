import { Disposable, Webview, WebviewView, WebviewViewProvider } from "vscode";

export interface RegisterViewUsage {
  name: string;
  read: boolean;
  written: boolean;
  input?: boolean;
}

export interface RegisterRemappingModel {
  scope: string;
  registers: RegisterViewUsage[];
}

export interface RegisterRemappingResult {
  ok: boolean;
  message: string;
}

export class RegisterRemappingView implements WebviewViewProvider, Disposable {
  static readonly viewType = "m68k.registerRemapping";

  private view?: WebviewView;
  private messageSubscription?: Disposable;
  private visibilitySubscription?: Disposable;

  constructor(
    private readonly load: () => Promise<RegisterRemappingModel | undefined>,
    private readonly apply: (
      mappings: Record<string, string>,
    ) => Promise<RegisterRemappingResult>,
  ) {}

  resolveWebviewView(view: WebviewView): void {
    this.messageSubscription?.dispose();
    this.visibilitySubscription?.dispose();
    this.view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = webviewHtml(view.webview);
    this.messageSubscription = view.webview.onDidReceiveMessage(
      async (message: { type?: string; mappings?: Record<string, string> }) => {
        if (message.type === "ready" || message.type === "refresh") {
          await this.refresh();
        } else if (message.type === "apply" && message.mappings) {
          const result = await this.apply(message.mappings);
          await view.webview.postMessage({ type: "result", ...result });
          if (result.ok) {
            await this.refresh();
          }
        }
      },
    );
    this.visibilitySubscription = view.onDidChangeVisibility(() => {
      if (view.visible) {
        void this.refresh();
      }
    });
  }

  async refresh(): Promise<void> {
    if (!this.view?.visible) {
      return;
    }
    const model = await this.load();
    await this.view.webview.postMessage({ type: "model", model });
  }

  dispose(): void {
    this.messageSubscription?.dispose();
    this.visibilitySubscription?.dispose();
  }
}

function webviewHtml(webview: Webview): string {
  const nonce = randomNonce();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    header {
      position: sticky;
      top: 0;
      z-index: 1;
      padding: 10px 12px 8px;
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border));
    }
    #scope {
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    main { padding: 4px 12px 72px; }
    .row {
      display: grid;
      grid-template-columns: 34px minmax(62px, 1fr) minmax(76px, 1.2fr);
      align-items: center;
      min-height: 34px;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-widget-border) 55%, transparent);
    }
    .row.unused { color: var(--vscode-disabledForeground); }
    .register { font-family: var(--vscode-editor-font-family); font-weight: 600; }
    .access { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    select, button {
      height: 24px;
      border: 1px solid var(--vscode-dropdown-border);
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      font: inherit;
    }
    select { width: 100%; padding: 0 4px; }
    select.changed { border-color: var(--vscode-focusBorder); }
    footer {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      padding: 8px 12px 10px;
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-widget-border));
    }
    #status { min-height: 18px; margin-bottom: 6px; color: var(--vscode-descriptionForeground); }
    #status.error { color: var(--vscode-errorForeground); }
    .actions { display: flex; gap: 6px; }
    button { padding: 0 10px; cursor: pointer; }
    button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); border-color: transparent; }
    button.primary:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { cursor: default; opacity: .55; }
    #empty { padding: 14px 0; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <header><div id="scope">No M68k scope</div></header>
  <main><div id="rows"></div><div id="empty">Open an M68k file to begin.</div></main>
  <footer>
    <div id="status"></div>
    <div class="actions">
      <button class="primary" id="apply" disabled>Apply</button>
      <button id="reset" disabled>Reset</button>
      <button id="refresh">Refresh</button>
    </div>
  </footer>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const allRegisters = ${JSON.stringify([
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
    ])};
    let model;
    let mappings = {};
    const rows = document.getElementById('rows');
    const empty = document.getElementById('empty');
    const scope = document.getElementById('scope');
    const status = document.getElementById('status');
    const apply = document.getElementById('apply');
    const reset = document.getElementById('reset');

    function accessLabel(usage) {
      if (!usage) return 'unused';
      const access = usage.read && usage.written ? 'read/write' : usage.read ? 'read' : usage.written ? 'write' : 'unknown';
      return usage.input ? access + ', input' : access;
    }

    function validate() {
      const changed = Object.entries(mappings).filter(([source, destination]) => source !== destination);
      const destinations = changed.map(([, destination]) => destination);
      const duplicate = destinations.find((value, index) => destinations.indexOf(value) !== index);
      const used = new Set((model?.registers || []).map(({ name }) => name));
      const sources = new Set(changed.map(([source]) => source));
      const occupied = destinations.find((destination) => used.has(destination) && !sources.has(destination));
      const conflict = duplicate || occupied;
      status.textContent = conflict ? conflict.toUpperCase() + ' has conflicting mappings' : '';
      status.className = conflict ? 'error' : '';
      apply.disabled = changed.length === 0 || !!conflict;
      reset.disabled = changed.length === 0;
    }

    function render(nextModel) {
      model = nextModel;
      mappings = {};
      rows.replaceChildren();
      scope.textContent = model?.scope || 'No M68k scope';
      empty.hidden = !!model;
      if (!model) {
        validate();
        return;
      }
      const usageByName = new Map(model.registers.map((usage) => [usage.name, usage]));
      for (const register of allRegisters) {
        const usage = usageByName.get(register);
        const row = document.createElement('div');
        row.className = 'row' + (usage ? '' : ' unused');
        const name = document.createElement('div');
        name.className = 'register';
        name.textContent = register.toUpperCase();
        const access = document.createElement('div');
        access.className = 'access';
        access.textContent = accessLabel(usage);
        const select = document.createElement('select');
        select.disabled = !usage;
        select.setAttribute('aria-label', 'Map ' + register.toUpperCase());
        for (const destination of allRegisters) {
          const option = document.createElement('option');
          option.value = destination;
          option.textContent = destination.toUpperCase() + (usageByName.has(destination) ? '' : ' (unused)');
          option.selected = destination === register;
          select.append(option);
        }
        select.addEventListener('change', () => {
          mappings[register] = select.value;
          select.classList.toggle('changed', select.value !== register);
          validate();
        });
        row.append(name, access, select);
        rows.append(row);
      }
      validate();
    }

    apply.addEventListener('click', () => vscode.postMessage({ type: 'apply', mappings }));
    reset.addEventListener('click', () => render(model));
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    window.addEventListener('message', ({ data }) => {
      if (data.type === 'model') render(data.model);
      if (data.type === 'result') {
        status.textContent = data.message;
        status.className = data.ok ? '' : 'error';
      }
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

function randomNonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () =>
    alphabet.charAt(Math.floor(Math.random() * alphabet.length)),
  ).join("");
}
