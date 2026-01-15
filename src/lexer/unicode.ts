/**
 * Unicode handling utilities for the Axon lexer
 *
 * Axon supports both Unicode and ASCII syntax variants.
 * This module provides utilities for identifying character classes
 * and handling multi-byte UTF-8 characters.
 */

/**
 * Unicode code points for special Axon symbols
 */
export const UNICODE = {
  // Function declaration
  FN: "\u0192", // ƒ (U+0192)

  // Lambda
  LAMBDA: "\u03BB", // λ (U+03BB)

  // Arrows
  ARROW_RIGHT: "\u2192", // → (U+2192)
  ARROW_LEFT: "\u2190", // ← (U+2190)

  // Comparison
  NOT_EQUAL: "\u2260", // ≠ (U+2260)
  LESS_OR_EQUAL: "\u2264", // ≤ (U+2264)
  GREATER_OR_EQUAL: "\u2265", // ≥ (U+2265)

  // Logical
  LOGICAL_AND: "\u2227", // ∧ (U+2227)
  LOGICAL_OR: "\u2228", // ∨ (U+2228)
  LOGICAL_NOT: "\u00AC", // ¬ (U+00AC)

  // Type symbols
  INTEGER: "\u2124", // ℤ (U+2124)
  NATURAL: "\u2115", // ℕ (U+2115)
  REAL: "\u211D", // ℝ (U+211D)
} as const;

/**
 * Set of all special Unicode symbols used in Axon
 */
export const UNICODE_SYMBOL_SET: Set<string> = new Set(Object.values(UNICODE));

/**
 * Check if a character is a Unicode letter (for identifiers)
 */
export function isUnicodeLetter(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.codePointAt(0)!;

  // ASCII letters
  if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
    return true;
  }

  // Extended Latin, Greek, Cyrillic, etc.
  // This is a simplified check - a full implementation would use Unicode categories
  if (code >= 0x00c0 && code <= 0x00ff && code !== 0x00d7 && code !== 0x00f7) {
    return true; // Latin Extended-A
  }
  if (code >= 0x0100 && code <= 0x017f) {
    return true; // Latin Extended-B
  }
  if (code >= 0x0370 && code <= 0x03ff) {
    return true; // Greek
  }
  if (code >= 0x0400 && code <= 0x04ff) {
    return true; // Cyrillic
  }

  return false;
}

/**
 * Check if a character is an uppercase letter (for type identifiers)
 */
export function isUppercaseLetter(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.codePointAt(0)!;

  // ASCII uppercase
  if (code >= 0x41 && code <= 0x5a) {
    return true;
  }

  // Unicode uppercase - simplified check
  if (code >= 0x00c0 && code <= 0x00d6) {
    return true; // Latin uppercase with diacritics
  }
  if (code >= 0x00d8 && code <= 0x00de) {
    return true; // More Latin uppercase
  }

  return false;
}

/**
 * Check if a character is a lowercase letter (for value identifiers)
 */
export function isLowercaseLetter(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.codePointAt(0)!;

  // ASCII lowercase
  if (code >= 0x61 && code <= 0x7a) {
    return true;
  }

  // Unicode lowercase - simplified check
  if (code >= 0x00df && code <= 0x00f6) {
    return true;
  }
  if (code >= 0x00f8 && code <= 0x00ff) {
    return true;
  }

  return false;
}

/**
 * Check if a character is a digit
 */
export function isDigit(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.charCodeAt(0);
  return code >= 0x30 && code <= 0x39; // 0-9
}

/**
 * Check if a character is a hex digit
 */
export function isHexDigit(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.charCodeAt(0);
  return (
    (code >= 0x30 && code <= 0x39) || // 0-9
    (code >= 0x41 && code <= 0x46) || // A-F
    (code >= 0x61 && code <= 0x66) // a-f
  );
}

/**
 * Check if a character is a binary digit
 */
export function isBinaryDigit(char: string): boolean {
  return char === "0" || char === "1";
}

/**
 * Check if a character is valid in an identifier (after the first character)
 */
export function isIdentifierContinue(char: string): boolean {
  return isUnicodeLetter(char) || isDigit(char) || char === "_";
}

/**
 * Check if a character is whitespace
 */
export function isWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

/**
 * Check if a character is a special Unicode symbol used in Axon syntax
 */
export function isUnicodeSymbol(char: string): boolean {
  return UNICODE_SYMBOL_SET.has(char);
}

/**
 * Get the byte length of a UTF-8 character at the given position
 */
export function utf8CharLength(str: string, index: number): number {
  const code = str.codePointAt(index);
  if (code === undefined) return 0;
  if (code <= 0x7f) return 1;
  if (code <= 0x7ff) return 2;
  if (code <= 0xffff) return 3;
  return 4;
}

/**
 * Iterate over a string character by character, handling multi-byte UTF-8
 */
export function* iterChars(str: string): Generator<{ char: string; index: number }> {
  for (let i = 0; i < str.length; ) {
    const codePoint = str.codePointAt(i)!;
    const char = String.fromCodePoint(codePoint);
    yield { char, index: i };
    i += char.length;
  }
}
