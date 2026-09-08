import * as lsp from "vscode-languageserver";
import { Provider } from ".";
import { Context } from "../context";
import { getDefinitions } from "../symbols";

export default class DefinitionProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onDefinition({
    textDocument,
    position,
  }: lsp.DefinitionParams): Promise<lsp.Location[]> {
    const defs = await getDefinitions(textDocument.uri, position, this.ctx);
    return defs.map((d) => d.location);
  }

  register(connection: lsp.Connection) {
    connection.onDefinition(this.onDefinition.bind(this));
    return {
      definitionProvider: true,
    };
  }
}
