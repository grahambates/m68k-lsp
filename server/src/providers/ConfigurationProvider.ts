import * as lsp from "vscode-languageserver";
import { DidChangeConfigurationNotification } from "vscode-languageserver";
import { Provider } from ".";
import { mergeConfig } from "../config";
import { Context } from "../context";

export default class ConfiguratonProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onDidChangeConfiguration() {
    const oldConfig = this.ctx.config;
    const newConfig = await this.ctx.connection.workspace.getConfiguration(
      "m68k"
    );
    this.ctx.config = mergeConfig(newConfig, oldConfig);
  }

  register(connection: lsp.Connection, capabilities: lsp.ClientCapabilities) {
    connection.onDidChangeConfiguration(
      this.onDidChangeConfiguration.bind(this)
    );
    const supportsDynamic =
      capabilities.workspace?.didChangeConfiguration?.dynamicRegistration;
    if (supportsDynamic) {
      connection.onInitialized(() => {
        connection.client.register(
          DidChangeConfigurationNotification.type,
          undefined
        );
      });
    }
    return {};
  }
}
