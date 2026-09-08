import * as lsp from "vscode-languageserver";
import { Provider } from ".";
import { Context } from "../context";
import { getReferences } from "../symbols";

export default class ReferencesProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onReferences({
    textDocument,
    position,
    context,
  }: lsp.ReferenceParams): Promise<lsp.Location[]> {
    const refs = await getReferences(
      textDocument.uri,
      position,
      this.ctx,
      context.includeDeclaration
    );
    return refs.map((s) => s.location);
  }

  register(connection: lsp.Connection) {
    connection.onReferences(this.onReferences.bind(this));
    return {
      referencesProvider: true,
    };
  }
}
