import * as lsp from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import Parser, { SyntaxNode, Query } from "web-tree-sitter";
import { getDependencies } from "./files";
import { containsPosition, nodeAsRange } from "./geometry";
import { Context } from "./context";

export interface NamedSymbol {
  location: lsp.Location;
  name: string;
}

export interface Literal {
  location: lsp.Location;
  text: string;
}

export interface Definition extends NamedSymbol {
  type: DefinitionType;
  selectionRange: lsp.Range;
  locals?: Map<string, Definition>;
  comment?: string;
}

export function isDefinition(symbol: NamedSymbol): symbol is Definition {
  return (symbol as Definition).selectionRange !== undefined;
}

export enum DefinitionType {
  Section = "section",
  Label = "label",
  Constant = "constant",
  Variable = "variable",
  Register = "register",
  RegisterList = "register_list",
  Offset = "offset",
  Macro = "macro",
  XRef = "xref",
}

export interface Symbols {
  definitions: Map<string, Definition>;
  references: Map<string, NamedSymbol[]>;
  includes: Literal[];
  incDirs: Literal[];
}

let symbolsQuery: Query | undefined;

/**
 * Process symbols in document
 */
export function processSymbols(
  uri: string,
  tree: Parser.Tree,
  ctx: Context
): Symbols {
  const symbols: Symbols = {
    definitions: new Map<string, Definition>(),
    references: new Map<string, NamedSymbol[]>(),
    includes: [],
    incDirs: [],
  };

  let lastGlobalLabel: Definition | undefined;

  function addDefinition(node: SyntaxNode, nameNode: SyntaxNode) {
    const name = nameNode.text;

    // Already defined in this doc?
    // Ignore interpolated macro with macro args
    if (symbols.definitions.has(name) || name.includes("\\")) {
      return;
    }

    const type = definitionNodeTypeMappings[node.type];

    const def: Definition = {
      name,
      type,
      location: { uri, range: nodeAsRange(node) },
      selectionRange: nodeAsRange(nameNode),
    };

    // Comments:
    const commentLines: string[] = [];

    // Same line comment
    const [descendantComment] = node.descendantsOfType("comment");
    if (descendantComment?.startPosition.row === node.startPosition.row) {
      commentLines.unshift(descendantComment.text);
    } else {
      // Preceding line comments
      let current = node;
      while (
        current.previousNamedSibling?.type === "comment" &&
        current.previousNamedSibling.startPosition.row ===
          current.startPosition.row - 1
      ) {
        current = current.previousNamedSibling;
        commentLines.unshift(current.text);
      }
    }

    // Convert to markdown:
    const horizontalRule = "***";
    const processedLines = commentLines.map((l) =>
      l
        // Remove comment char and leading whitespace from each line
        .replace(/^[;*]\s?/, "")
        // Convert repeated punctuation lines to MD horizontal rules
        // This looks better and avoids creating headings with --- or === underline style
        // Use a tmp placeholder string until special chars are escaped
        .replace(/^\s*[*-=]{3,}\s*$/, "~~~")
        // Escape special chars
        .replace(/([*_{}[\]()#+-.!`])/g, "\\$1")
        // Replace placholder with actual rule
        .replace(/^~~~$/, horizontalRule)
    );
    // Ensure no horizontal rules at start or end of block
    while (processedLines[0] === horizontalRule) {
      processedLines.shift();
    }
    while (processedLines[processedLines.length - 1] === horizontalRule) {
      processedLines.pop();
    }

    if (commentLines.length) {
      def.comment = processedLines.join("  \n");
    }

    if (type === DefinitionType.Label) {
      if (isLocalLabel(name)) {
        if (lastGlobalLabel) {
          lastGlobalLabel.locals?.set(name, def);
          return;
        }
      } else {
        lastGlobalLabel = def;
        def.locals = new Map();
      }
    }

    symbols.definitions.set(name, def);
  }

  if (!symbolsQuery) {
    symbolsQuery = ctx.language.query(`
      (symbol) @symbol
      (include) @include
      (include_dir) @include_dir
      (external_reference) @external_reference
    `);
  }
  const captures = symbolsQuery.captures(tree.rootNode);

  for (const { node, name } of captures) {
    if (name === "include") {
      const pathNode = node.childForFieldName("path");
      if (pathNode) {
        symbols.includes.push({
          location: { uri, range: nodeAsRange(pathNode) },
          text: processPath(pathNode.text),
        });
      }
      continue;
    }

    if (name === "include_dir") {
      const pathNode = node.childForFieldName("path");
      if (pathNode) {
        symbols.incDirs.push({
          location: { uri, range: nodeAsRange(pathNode) },
          text: processPath(pathNode.text),
        });
      }
      continue;
    }

    if (name === "external_reference") {
      const items = node.childForFieldName("symbols");
      if (items?.namedChildren) {
        for (const nameNode of items.namedChildren) {
          addDefinition(node, nameNode);
        }
      }
    }

    // Symbols:

    if (!node.parent) {
      continue;
    }
    const defMapping = definitionNodeTypeMappings[node.parent.type];

    if (defMapping) {
      // Definition:
      const nameNode =
        node.parent.childForFieldName("name") || node.parent.firstNamedChild;
      if (nameNode) {
        addDefinition(node.parent, nameNode);
      }
    } else {
      // Reference:
      const name = node.text;
      let refs = symbols.references.get(name);
      if (!refs) {
        refs = [];
        symbols.references.set(name, refs);
      }
      refs.push({
        name,
        location: { uri, range: nodeAsRange(node) },
      });
    }
  }

  return symbols;
}

/**
 * Process path string - removes quotes and handles escaped chars
 */
export function processPath(path: string): string {
  if (path.startsWith('"') && path.endsWith('"')) {
    return path
      .substring(1, path.length - 1)
      .replace(/""/g, '"')
      .replace('\\"', '"');
  }
  if (path.startsWith("'") && path.endsWith("'")) {
    return path
      .substring(1, path.length - 1)
      .replace(/''/g, "'")
      .replace("\\'", "'");
  }
  return path;
}

/**
 * Get symbol at position
 */
export function symbolAtPosition(
  symbols: Symbols,
  position: lsp.Position
): NamedSymbol | undefined {
  return (
    definitionAtPosition(symbols, position) ||
    referenceAtPosition(symbols, position)
  );
}

/**
 * Get reference symbol at position
 */
export function referenceAtPosition(
  symbols: Symbols,
  position: lsp.Position
): NamedSymbol | undefined {
  for (const [, refs] of symbols.references) {
    const foundRef = refs.find((ref) =>
      containsPosition(ref.location.range, position)
    );
    if (foundRef) {
      return foundRef;
    }
  }
}

/**
 * Get definition symbol at position
 */
export function definitionAtPosition(
  docSymbols: Symbols,
  position: lsp.Position
): Definition | undefined {
  for (const def of docSymbols.definitions.values()) {
    if (def.locals) {
      for (const local of def.locals.values()) {
        if (containsPosition(local.selectionRange, position)) {
          return local;
        }
      }
    }
    if (containsPosition(def.selectionRange, position)) {
      return def;
    }
  }
}

export function isLocalLabel(label: string): boolean {
  return label.startsWith(".") || label.endsWith("$");
}

/**
 * Get references to symbol at position
 */
export async function getReferences(
  uri: string,
  position: lsp.Position,
  ctx: Context,
  includeDeclaration = false
): Promise<NamedSymbol[]> {
  const currentDoc = ctx.store.get(uri);
  if (!currentDoc) {
    return [];
  }

  const results: NamedSymbol[] = [];

  const symbol = symbolAtPosition(currentDoc.symbols, position);
  if (!symbol) {
    return [];
  }

  if (isLocalLabel(symbol.name)) {
    const { range, startLabel } = localContext(
      symbol,
      currentDoc.symbols,
      currentDoc.document
    );
    const refs = currentDoc.symbols.references.get(symbol.name);
    if (refs) {
      results.push(
        ...refs.filter((ref) =>
          containsPosition(range, ref.location.range.start)
        )
      );
    }
    if (includeDeclaration) {
      const def = startLabel?.locals?.get(symbol.name);
      if (def) {
        results.push(def);
      }
    }
  } else {
    // Current doc
    const refs = currentDoc.symbols.references.get(symbol.name);
    if (refs) {
      results.push(...refs);
    }
    if (includeDeclaration) {
      const def = currentDoc.symbols.definitions.get(symbol.name);
      if (def) {
        results.push(def);
      }
    }

    // Dependent docs
    const deps = await getDependencies(uri, ctx);
    for (const depUri of deps) {
      const depenedentDoc = ctx.store.get(depUri);
      if (depenedentDoc) {
        const refs = depenedentDoc.symbols.references.get(symbol.name);
        if (refs) {
          results.push(...refs);
        }
        if (includeDeclaration) {
          const def = depenedentDoc.symbols.definitions.get(symbol.name);
          if (def) {
            results.push(def);
          }
        }
      }
    }
  }

  return results;
}

type LocalContext = {
  range: lsp.Range;
  startLabel?: Definition;
  endLabel?: Definition;
};

/**
 * Get definitions of word at position
 */
export async function getDefinitions(
  uri: string,
  position: lsp.Position,
  ctx: Context
): Promise<Definition[]> {
  const processed = ctx.store.get(uri);
  if (!processed) {
    return [];
  }

  const symbol = symbolAtPosition(processed.symbols, position);
  if (!symbol) {
    return [];
  }

  if (isLocalLabel(symbol.name)) {
    const globalLabel = labelBeforePosition(processed.symbols, position);
    const def = globalLabel?.locals?.get(symbol.name);
    return def ? [def] : [];
  }

  // Definition in current doc
  const def = processed.symbols.definitions.get(symbol.name);
  if (def) {
    return [def];
  }

  const defs: Definition[] = [];

  const deps = await getDependencies(uri, ctx);
  for (const depUri of deps) {
    const processedDoc = ctx.store.get(depUri);
    if (processedDoc) {
      const def = processedDoc.symbols.definitions.get(symbol.name);
      if (def) {
        defs.push(def);
      }
    }
  }

  return defs;
}

/**
 * Get definition of first global label before position
 */
export function labelBeforePosition(
  docSymbols: Symbols,
  position: lsp.Position
): Definition | undefined {
  let label: Definition | undefined;
  for (const def of docSymbols.definitions.values()) {
    if (def.type === DefinitionType.Label && !isLocalLabel(def.name)) {
      if (def.selectionRange.start.line > position.line) {
        break;
      }
      label = def;
    }
  }
  return label;
}

/**
 * Get range between global labels containing symbol
 */
function localContext(
  symbol: NamedSymbol,
  docSymbols: Symbols,
  document: TextDocument
): LocalContext {
  const range: lsp.Range = {
    start: { character: 0, line: 0 },
    end: { character: 0, line: document.lineCount }, // todo
  };

  let startLabel: Definition | undefined;
  let endLabel: Definition | undefined;

  for (const def of docSymbols.definitions.values()) {
    if (def.type === DefinitionType.Label && !isLocalLabel(def.name)) {
      if (def.location.range.start.line > symbol.location.range.start.line) {
        range.end = {
          ...def.location.range.start,
          character: 0,
        };
        endLabel = def;
        break;
      }
      range.start = def.location.range.start;
      startLabel = def;
    }
  }
  return { range, startLabel, endLabel };
}

const definitionNodeTypeMappings: Record<string, DefinitionType> = {
  section: DefinitionType.Section,
  label: DefinitionType.Label,
  external_label: DefinitionType.Label,
  macro_definition: DefinitionType.Macro,
  symbol_definition: DefinitionType.Constant,
  symbol_assignment: DefinitionType.Variable,
  offset_definition: DefinitionType.Offset,
  register_definition: DefinitionType.Register,
  register_list_definition: DefinitionType.RegisterList,
  external_reference: DefinitionType.XRef,
};

export const symbolKindMappings: Record<DefinitionType, lsp.SymbolKind> = {
  [DefinitionType.Section]: lsp.SymbolKind.Module,
  [DefinitionType.Label]: lsp.SymbolKind.Field,
  [DefinitionType.Macro]: lsp.SymbolKind.Function,
  [DefinitionType.Constant]: lsp.SymbolKind.Constant,
  [DefinitionType.Variable]: lsp.SymbolKind.Variable,
  [DefinitionType.Register]: lsp.SymbolKind.Constant,
  [DefinitionType.RegisterList]: lsp.SymbolKind.Constant,
  [DefinitionType.Offset]: lsp.SymbolKind.Constant,
  [DefinitionType.XRef]: lsp.SymbolKind.Field,
};
