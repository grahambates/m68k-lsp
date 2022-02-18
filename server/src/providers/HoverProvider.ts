import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SyntaxNode } from "web-tree-sitter";
import { Provider } from ".";
import { nodeAsRange, positionToPoint } from "../geometry";
import { resolveInclude } from "../files";
import { DefinitionType, getDefinitions, processPath } from "../symbols";
import { mnemonicDocs, registerDocs, sizeDocs } from "../docs/index";
import { RegisterName, Size } from "../syntax";
import { Context } from "../context";
import {
  formatDeclaration,
  formatMnemonicDoc,
  formatNumeric,
} from "../formatting";
import { MarkupContent } from "vscode-languageserver";

export default class HoverProvider implements Provider {
  constructor(protected readonly ctx: Context) {}

  async onHover({
    textDocument,
    position,
  }: lsp.HoverParams): Promise<lsp.Hover | undefined> {
    const processed = this.ctx.store.get(textDocument.uri);
    if (!processed) {
      return;
    }

    const node = processed.tree.rootNode.descendantForPosition(
      positionToPoint(position)
    );

    switch (node.type) {
      case "instruction_mnemonic":
        return this.hoverInstructionMnemonic(node);
      case "directive_mnemonic":
      case "control_mnemonic":
        return this.hoverDirectiveMnemonic(node);
      case "size":
        return this.hoverSize(node);
      case "symbol":
        return this.hoverSymbol(node, processed.document, position);
      case "path":
        return this.hoverPath(node, textDocument.uri);
      case "string_literal":
        if (node.parent?.type === "path") {
          return this.hoverPath(node.parent, textDocument.uri);
        }
        break;
      case "decimal_literal":
      case "hexadecimal_literal":
      case "octal_literal":
      case "binary_literal":
        return this.hoverNumber(node);
      case "named_register":
        return this.hoverRegister(node);
    }
  }

  register(connection: lsp.Connection) {
    connection.onHover(this.onHover.bind(this));
    return {
      hoverProvider: true,
    };
  }

  private async hoverInstructionMnemonic(node: SyntaxNode) {
    const docs = await lookupMnemonicDoc(node.text);
    return {
      range: nodeAsRange(node),
      contents: docs || {
        kind: lsp.MarkupKind.PlainText,
        value: "(instruction) " + node.text.toUpperCase(),
      },
    };
  }

  private async hoverDirectiveMnemonic(node: SyntaxNode) {
    const docs = await lookupMnemonicDoc(node.text);
    return {
      range: nodeAsRange(node),
      contents: docs || {
        kind: lsp.MarkupKind.PlainText,
        value: "(directive) " + node.text.toUpperCase(),
      },
    };
  }

  private async hoverSize(node: SyntaxNode) {
    const sizeDoc = sizeDocs[node.text.toLowerCase() as Size];
    return {
      range: nodeAsRange(node),
      contents: {
        kind: lsp.MarkupKind.PlainText,
        value: sizeDoc || "(size)",
      },
    };
  }

  private async hoverSymbol(
    node: SyntaxNode,
    document: TextDocument,
    position: lsp.Position
  ) {
    const [def] = await getDefinitions(document.uri, position, this.ctx);
    const contents: lsp.MarkedString[] = [];

    if (def) {
      if (def.comment) {
        contents.push(def.comment); // TODO
      }

      switch (def.type) {
        case DefinitionType.Register:
        case DefinitionType.RegisterList:
        case DefinitionType.Constant:
        case DefinitionType.Variable: {
          // Find Declaration and add code block
          const startLine = def.location.range.start.line;
          const lines = document.getText().split(/\r?\n/g);
          const definitionLine = lines[startLine];
          contents.push({
            language: document.languageId,
            value: formatDeclaration(definitionLine),
          });
          break;
        }
        default:
          contents.push(`(${def.type}) ${def.name}`);
      }

      return {
        range: nodeAsRange(node),
        contents,
      };
    }
  }

  private async hoverPath(node: SyntaxNode, uri: string) {
    const path = processPath(node.text);
    const resolved = await resolveInclude(uri, path, this.ctx);

    return {
      range: nodeAsRange(node),
      contents: {
        kind: lsp.MarkupKind.Markdown,
        value: resolved || path,
      },
    };
  }

  private async hoverNumber(node: SyntaxNode) {
    return {
      range: nodeAsRange(node),
      contents: {
        kind: lsp.MarkupKind.Markdown,
        value: formatNumeric(node.text),
      },
    };
  }

  private async hoverRegister(node: SyntaxNode) {
    const doc = registerDocs[<RegisterName>node.text.toLowerCase()];
    if (doc) {
      return {
        range: nodeAsRange(node),
        contents: {
          kind: lsp.MarkupKind.Markdown,
          value: registerDocs[<RegisterName>node.text.toLowerCase()],
        },
      };
    }
  }
}

function lookupMnemonicDoc(mnemonic: string): MarkupContent | undefined {
  mnemonic = mnemonic.toLowerCase();
  if (mnemonicDocs[mnemonic]) {
    return formatMnemonicDoc(mnemonicDocs[mnemonic]);
  }
}
