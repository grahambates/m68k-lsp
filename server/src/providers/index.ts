import { Connection, ServerCapabilities } from "vscode-languageserver";
import { Context } from "../context";

import CompletionProvider from "./CompletionProvider";
import ConfiguratonProvider from "./ConfigurationProvider";
import DefinitionProvider from "./DefinitionProvider";
import DocumentFormattingProvider from "./DocumentFormatttingProvider";
import DocumentHighlightProvider from "./DocumentHighlightProvider";
import DocumentLinkProvider from "./DocumentLinkProvider";
import DocumentSymbolProvider from "./DocumentSymbolProvider";
import FileOperationsProvider from "./FileOperationsProvider";
import FoldingRangeProvider from "./FoldingRangeProvider";
import HoverProvider from "./HoverProvider";
import ReferencesProvider from "./ReferencesProvider";
import RenameProvider from "./RenameProvider";
// import SemanticTokensProvider from "./SemanticTokensProvider";
import SignatureHelpProvider from "./SignatureHelpProvider";
import TextDocumentSyncProvider from "./TextDocumentSyncProvider";
import WorkspaceSymbolProvider from "./WorkspaceSymbolProvider";

export interface Provider {
  register(connection: Connection): ServerCapabilities;
}
const providers = [
  CompletionProvider,
  ConfiguratonProvider,
  DefinitionProvider,
  DocumentFormattingProvider,
  DocumentHighlightProvider,
  DocumentLinkProvider,
  DocumentSymbolProvider,
  FileOperationsProvider,
  FoldingRangeProvider,
  HoverProvider,
  ReferencesProvider,
  RenameProvider,
  // SemanticTokensProvider,
  SignatureHelpProvider,
  TextDocumentSyncProvider,
  WorkspaceSymbolProvider,
];

export default function registerProviders(
  connection: Connection,
  ctx: Context
): ServerCapabilities {
  return providers.reduce((acc, P) => {
    const p = new P(ctx);
    const c = p.register(connection);
    return Object.assign(acc, c);
  }, {});
}
