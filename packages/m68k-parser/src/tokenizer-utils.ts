/**
 * Shared utility functions for tokenizers
 */

/**
 * Check if a character is a valid start of an identifier
 * Allows letters, underscore and at-sign
 * Note: Dots are NOT included here because the tokenizer needs to handle them separately
 *
 * `@` matches vasm's mot syntax, where ISIDSTART accepts '.', '@' and '_'
 * alongside letters. Symbols such as `@palette` are common in Amiga sources.
 */
export function isIdentifierStart(ch: string): boolean {
  return /[a-zA-Z_@]/.test(ch);
}

/**
 * Check if a character is a valid part of an identifier
 * Allows letters, digits, underscore, dollar, at-sign and backslash
 * Note: Dots are NOT included here because the tokenizer needs to handle them separately
 *
 * vasm accepts '@' within an identifier under devpac_compat, and it cannot
 * begin anything else mid-identifier, so it is allowed unconditionally here.
 */
export function isIdentifierPart(ch: string): boolean {
  return /[a-zA-Z0-9_$@\\]/.test(ch);
}

/**
 * Check if a character is a digit
 */
export function isDigit(ch: string): boolean {
  return /[0-9]/.test(ch);
}

/**
 * Check if a character is a hex digit
 */
export function isHexDigit(ch: string): boolean {
  return /[0-9a-fA-F]/.test(ch);
}

/**
 * Check if a character is a binary digit
 */
export function isBinaryDigit(ch: string): boolean {
  return /[01]/.test(ch);
}

/**
 * Check if a character is an octal digit
 */
export function isOctalDigit(ch: string): boolean {
  return /[0-7]/.test(ch);
}

/**
 * Check if a character is whitespace
 */
export function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/**
 * Check if a string is a valid identifier
 * Valid identifiers can start with letter, underscore, or dot and contain letters, digits, underscores, dots, $, or \\
 * This is more permissive than the tokenizer rules because symbols can contain dots (e.g., label.sub)
 * even though the tokenizer breaks them into separate tokens
 */
export function isValidIdentifier(str: string): boolean {
  if (!str || str.length === 0) return false;
  // Allow starting with letter, underscore, dot or at-sign
  if (!/[a-zA-Z_.@]/.test(str[0])) return false;
  // vasm rejects a lone '.', '@' or '_' as an identifier
  if (str.length === 1 && /[._@]/.test(str)) return false;
  // Allow continuing with alphanumeric, underscore, dot, dollar, at-sign or backslash
  for (let i = 1; i < str.length; i++) {
    if (!/[a-zA-Z0-9_.$@\\]/.test(str[i])) return false;
  }
  return true;
}

/**
 * Does a name embed a macro placeholder?
 *
 * Names like `BLTEN_\1` and `.loop\@` are templates resolved when the macro
 * expands, so as written they refer to nothing.
 */
export function isInterpolated(name: string): boolean {
  return name.includes("\\");
}
