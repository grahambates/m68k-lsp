import * as lsp from "vscode-languageserver";
import { DidChangeConfigurationNotification } from "vscode-languageserver";
import { Provider } from ".";
import { Context } from "../context";

export default class ConfiguratonProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onDidChangeConfiguration() {
    const newConfig = await this.ctx.connection.workspace.getConfiguration(
      "m68k"
    );
    this.ctx.config = newConfig;
  }

  register(connection: lsp.Connection) {
    connection.onDidChangeConfiguration(
      this.onDidChangeConfiguration.bind(this)
    );
    connection.onInitialized(() => {
      connection.client.register(
        DidChangeConfigurationNotification.type,
        undefined
      );
    });
    return {};
  }
}
