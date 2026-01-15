/**
 * Axon Lexer Module
 *
 * Exports the lexer and related types for tokenizing Axon source code.
 */

export { Lexer, tokenize, tokenizeString, type LexerError } from "./lexer";
export {
  type Token,
  TokenKind,
  type TokenValue,
  type IntSuffix,
  token,
  tokenKindName,
  describeToken,
  KEYWORDS,
  UNICODE_SYMBOLS,
} from "./tokens";
export {
  UNICODE,
  UNICODE_SYMBOL_SET,
  isUnicodeLetter,
  isUppercaseLetter,
  isLowercaseLetter,
  isDigit,
  isHexDigit,
  isBinaryDigit,
  isIdentifierContinue,
  isWhitespace,
  isUnicodeSymbol,
} from "./unicode";
