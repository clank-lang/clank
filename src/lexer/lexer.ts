/**
 * Axon Lexer
 *
 * Tokenizes Axon source code into a stream of tokens.
 * Supports both Unicode and ASCII syntax variants.
 */

import { SourceFile } from "../utils/source";
import type { SourceSpan } from "../utils/span";
import {
  Token,
  TokenKind,
  TokenValue,
  token,
  KEYWORDS,
  UNICODE_SYMBOLS,
  type IntSuffix,
} from "./tokens";
import {
  isDigit,
  isHexDigit,
  isBinaryDigit,
  isLowercaseLetter,
  isUppercaseLetter,
  isIdentifierContinue,
  isWhitespace,
  isUnicodeSymbol,
} from "./unicode";

export interface LexerError {
  message: string;
  span: SourceSpan;
}

export class Lexer {
  private source: SourceFile;
  private pos: number = 0;
  private errors: LexerError[] = [];

  constructor(source: SourceFile) {
    this.source = source;
  }

  /**
   * Get all lexer errors
   */
  getErrors(): LexerError[] {
    return this.errors;
  }

  /**
   * Tokenize the entire source file
   */
  tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      const tok = this.nextToken();
      tokens.push(tok);
      if (tok.kind === TokenKind.Eof) {
        break;
      }
    }

    // Ensure we always end with EOF
    if (tokens.length === 0 || tokens[tokens.length - 1].kind !== TokenKind.Eof) {
      tokens.push(this.makeToken(TokenKind.Eof, this.pos, this.pos));
    }

    return tokens;
  }

  /**
   * Get the next token from the source
   */
  nextToken(): Token {
    this.skipWhitespaceAndComments();

    if (this.isAtEnd()) {
      return this.makeToken(TokenKind.Eof, this.pos, this.pos);
    }

    const char = this.peek();

    // Check for Unicode symbols first
    if (isUnicodeSymbol(char)) {
      return this.scanUnicodeSymbol();
    }

    // Identifiers and keywords
    if (isLowercaseLetter(char)) {
      return this.scanIdentifier();
    }

    // Type identifiers (uppercase)
    if (isUppercaseLetter(char)) {
      return this.scanTypeIdentifier();
    }

    // Numbers
    if (isDigit(char) || (char === "." && isDigit(this.peekNext()))) {
      return this.scanNumber();
    }

    // Strings (check for triple-quote multiline strings first)
    if (char === '"') {
      if (this.peekNext() === '"' && this.peekAt(2) === '"') {
        return this.scanMultilineString();
      }
      return this.scanString();
    }

    // Template strings
    if (char === "`") {
      return this.scanTemplateString();
    }

    // Operators and punctuation
    return this.scanOperatorOrPunctuation();
  }

  // ===== Character Navigation =====

  private isAtEnd(): boolean {
    return this.pos >= this.source.content.length;
  }

  private peek(): string {
    if (this.isAtEnd()) return "\0";
    const codePoint = this.source.content.codePointAt(this.pos);
    return codePoint !== undefined ? String.fromCodePoint(codePoint) : "\0";
  }

  private peekNext(): string {
    const current = this.peek();
    const nextPos = this.pos + current.length;
    if (nextPos >= this.source.content.length) return "\0";
    const codePoint = this.source.content.codePointAt(nextPos);
    return codePoint !== undefined ? String.fromCodePoint(codePoint) : "\0";
  }

  private peekAt(offset: number): string {
    let pos = this.pos;
    for (let i = 0; i < offset && pos < this.source.content.length; i++) {
      const char = this.source.content.codePointAt(pos);
      if (char === undefined) return "\0";
      pos += String.fromCodePoint(char).length;
    }
    if (pos >= this.source.content.length) return "\0";
    const codePoint = this.source.content.codePointAt(pos);
    return codePoint !== undefined ? String.fromCodePoint(codePoint) : "\0";
  }

  private advance(): string {
    if (this.isAtEnd()) return "\0";
    const char = this.peek();
    this.pos += char.length;
    return char;
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false;
    if (this.peek() !== expected) return false;
    this.advance();
    return true;
  }


  // ===== Token Creation =====

  private makeToken(kind: TokenKind, start: number, end: number, value?: TokenValue): Token {
    return token(kind, this.source.spanAt(start, end), value);
  }

  private errorToken(message: string, start: number, end: number): Token {
    const span = this.source.spanAt(start, end);
    this.errors.push({ message, span });
    return token(TokenKind.Error, span, { error: message });
  }

  // ===== Whitespace and Comments =====

  private skipWhitespaceAndComments(): void {
    while (!this.isAtEnd()) {
      const char = this.peek();

      if (isWhitespace(char)) {
        this.advance();
        continue;
      }

      // Single-line comment
      if (char === "/" && this.peekNext() === "/") {
        this.skipLineComment();
        continue;
      }

      // Multi-line comment (with nesting)
      if (char === "/" && this.peekNext() === "*") {
        this.skipBlockComment();
        continue;
      }

      break;
    }
  }

  private skipLineComment(): void {
    // Skip the //
    this.advance();
    this.advance();

    while (!this.isAtEnd() && this.peek() !== "\n") {
      this.advance();
    }
  }

  private skipBlockComment(): void {
    const commentStart = this.pos;

    // Skip the /*
    this.advance();
    this.advance();

    let depth = 1;

    while (!this.isAtEnd() && depth > 0) {
      if (this.peek() === "/" && this.peekNext() === "*") {
        this.advance();
        this.advance();
        depth++;
      } else if (this.peek() === "*" && this.peekNext() === "/") {
        this.advance();
        this.advance();
        depth--;
      } else {
        this.advance();
      }
    }

    if (depth > 0) {
      this.errors.push({
        message: "Unterminated block comment",
        span: this.source.spanAt(commentStart, this.pos),
      });
    }
  }

  // ===== Identifiers and Keywords =====

  private scanIdentifier(): Token {
    const start = this.pos;

    while (!this.isAtEnd() && isIdentifierContinue(this.peek())) {
      this.advance();
    }

    const text = this.source.content.slice(start, this.pos);

    // Check for keywords
    const keywordKind = KEYWORDS.get(text);
    if (keywordKind !== undefined) {
      return this.makeToken(keywordKind, start, this.pos);
    }

    // Check for underscore
    if (text === "_") {
      return this.makeToken(TokenKind.Underscore, start, this.pos);
    }

    return this.makeToken(TokenKind.Ident, start, this.pos, { ident: text });
  }

  private scanTypeIdentifier(): Token {
    const start = this.pos;

    while (!this.isAtEnd() && isIdentifierContinue(this.peek())) {
      this.advance();
    }

    const text = this.source.content.slice(start, this.pos);

    // Check for built-in type keywords
    const keywordKind = KEYWORDS.get(text);
    if (keywordKind !== undefined) {
      return this.makeToken(keywordKind, start, this.pos);
    }

    return this.makeToken(TokenKind.TypeIdent, start, this.pos, { ident: text });
  }

  // ===== Unicode Symbols =====

  private scanUnicodeSymbol(): Token {
    const start = this.pos;
    const char = this.advance();

    const kind = UNICODE_SYMBOLS.get(char);
    if (kind !== undefined) {
      return this.makeToken(kind, start, this.pos);
    }

    return this.errorToken(`Unknown Unicode symbol: ${char}`, start, this.pos);
  }

  // ===== Numbers =====

  private scanNumber(): Token {
    const start = this.pos;

    // Check for hex or binary prefix
    if (this.peek() === "0") {
      const next = this.peekNext();
      if (next === "x" || next === "X") {
        return this.scanHexNumber();
      }
      if (next === "b" || next === "B") {
        return this.scanBinaryNumber();
      }
    }

    // Scan integer part
    this.scanDigits();

    // Check for float
    if (this.peek() === "." && isDigit(this.peekNext())) {
      this.advance(); // consume .
      this.scanDigits();

      // Check for exponent
      if (this.peek() === "e" || this.peek() === "E") {
        this.scanExponent();
      }

      const text = this.source.content.slice(start, this.pos);
      const value = parseFloat(text.replace(/_/g, ""));
      return this.makeToken(TokenKind.FloatLit, start, this.pos, { float: value });
    }

    // Check for exponent (still a float)
    if (this.peek() === "e" || this.peek() === "E") {
      this.scanExponent();
      const text = this.source.content.slice(start, this.pos);
      const value = parseFloat(text.replace(/_/g, ""));
      return this.makeToken(TokenKind.FloatLit, start, this.pos, { float: value });
    }

    // It's an integer
    const suffix = this.scanIntSuffix();
    const text = this.source.content.slice(start, this.pos - (suffix?.length ?? 0));
    const value = BigInt(text.replace(/_/g, ""));

    return this.makeToken(TokenKind.IntLit, start, this.pos, {
      int: { value, suffix },
    });
  }

  private scanHexNumber(): Token {
    const start = this.pos;

    // Skip 0x
    this.advance();
    this.advance();

    if (!isHexDigit(this.peek())) {
      return this.errorToken("Invalid hex literal: expected hex digit after 0x", start, this.pos);
    }

    while (!this.isAtEnd() && (isHexDigit(this.peek()) || this.peek() === "_")) {
      this.advance();
    }

    const suffix = this.scanIntSuffix();
    const text = this.source.content.slice(start, this.pos - (suffix?.length ?? 0));
    const value = BigInt(text.replace(/_/g, ""));

    return this.makeToken(TokenKind.IntLit, start, this.pos, {
      int: { value, suffix },
    });
  }

  private scanBinaryNumber(): Token {
    const start = this.pos;

    // Skip 0b
    this.advance();
    this.advance();

    if (!isBinaryDigit(this.peek())) {
      return this.errorToken(
        "Invalid binary literal: expected 0 or 1 after 0b",
        start,
        this.pos
      );
    }

    while (!this.isAtEnd() && (isBinaryDigit(this.peek()) || this.peek() === "_")) {
      this.advance();
    }

    const suffix = this.scanIntSuffix();
    const text = this.source.content.slice(start, this.pos - (suffix?.length ?? 0));
    const value = BigInt(text.replace(/_/g, ""));

    return this.makeToken(TokenKind.IntLit, start, this.pos, {
      int: { value, suffix },
    });
  }

  private scanDigits(): void {
    while (!this.isAtEnd() && (isDigit(this.peek()) || this.peek() === "_")) {
      this.advance();
    }
  }

  private scanExponent(): void {
    // Consume e/E
    this.advance();

    // Optional sign
    if (this.peek() === "+" || this.peek() === "-") {
      this.advance();
    }

    this.scanDigits();
  }

  private scanIntSuffix(): IntSuffix {
    if (this.peek() === "i") {
      const next = this.peekNext();
      const next2 = this.peekAt(2);

      if (next === "3" && next2 === "2") {
        this.advance(); // i
        this.advance(); // 3
        this.advance(); // 2
        return "i32";
      }

      if (next === "6" && next2 === "4") {
        this.advance(); // i
        this.advance(); // 6
        this.advance(); // 4
        return "i64";
      }
    }

    return null;
  }

  // ===== Strings =====

  private scanString(): Token {
    const start = this.pos;

    // Skip opening quote
    this.advance();

    let value = "";

    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === "\n") {
        return this.errorToken("Unterminated string: unexpected newline", start, this.pos);
      }

      if (this.peek() === "\\") {
        this.advance();
        const escaped = this.scanEscapeSequence();
        if (escaped === null) {
          return this.errorToken(`Invalid escape sequence: \\${this.peek()}`, start, this.pos);
        }
        value += escaped;
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      return this.errorToken("Unterminated string", start, this.pos);
    }

    // Skip closing quote
    this.advance();

    return this.makeToken(TokenKind.StringLit, start, this.pos, { string: value });
  }

  private scanMultilineString(): Token {
    const start = this.pos;

    // Skip opening triple quotes
    this.advance(); // "
    this.advance(); // "
    this.advance(); // "

    // If immediately followed by newline, skip it (common formatting pattern)
    if (this.peek() === "\n") {
      this.advance();
    } else if (this.peek() === "\r" && this.peekNext() === "\n") {
      this.advance();
      this.advance();
    }

    let value = "";

    while (!this.isAtEnd()) {
      // Check for closing triple quotes
      if (this.peek() === '"' && this.peekNext() === '"' && this.peekAt(2) === '"') {
        // Skip closing triple quotes
        this.advance(); // "
        this.advance(); // "
        this.advance(); // "
        return this.makeToken(TokenKind.StringLit, start, this.pos, { string: value });
      }

      if (this.peek() === "\\") {
        this.advance();
        const escaped = this.scanEscapeSequence();
        if (escaped === null) {
          // In multiline strings, keep invalid escapes literally
          value += "\\" + this.advance();
        } else {
          value += escaped;
        }
      } else {
        value += this.advance();
      }
    }

    return this.errorToken("Unterminated multiline string", start, this.pos);
  }

  private scanTemplateString(): Token {
    const start = this.pos;

    // Skip opening backtick
    this.advance();

    let value = "";

    while (!this.isAtEnd() && this.peek() !== "`") {
      if (this.peek() === "\\") {
        this.advance();
        const escaped = this.scanEscapeSequence();
        if (escaped === null) {
          // In template strings, invalid escapes are kept literally
          value += "\\" + this.advance();
        } else {
          value += escaped;
        }
      } else if (this.peek() === "$" && this.peekNext() === "{") {
        // For now, we just include the interpolation as part of the string
        // The parser will need to handle this specially
        value += this.advance(); // $
        value += this.advance(); // {

        // Scan until matching }
        let depth = 1;
        while (!this.isAtEnd() && depth > 0) {
          const c = this.peek();
          if (c === "{") depth++;
          else if (c === "}") depth--;

          if (depth > 0) {
            value += this.advance();
          }
        }

        if (this.isAtEnd()) {
          return this.errorToken("Unterminated template interpolation", start, this.pos);
        }

        value += this.advance(); // }
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      return this.errorToken("Unterminated template string", start, this.pos);
    }

    // Skip closing backtick
    this.advance();

    return this.makeToken(TokenKind.TemplateLit, start, this.pos, { string: value });
  }

  private scanEscapeSequence(): string | null {
    if (this.isAtEnd()) return null;

    const char = this.advance();

    switch (char) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "\\":
        return "\\";
      case '"':
        return '"';
      case "'":
        return "'";
      case "0":
        return "\0";
      case "`":
        return "`";
      case "$":
        return "$";
      default:
        return null;
    }
  }

  // ===== Operators and Punctuation =====

  private scanOperatorOrPunctuation(): Token {
    const start = this.pos;
    const char = this.advance();

    switch (char) {
      // Single-character tokens
      case "(":
        return this.makeToken(TokenKind.LParen, start, this.pos);
      case ")":
        return this.makeToken(TokenKind.RParen, start, this.pos);
      case "[":
        return this.makeToken(TokenKind.LBracket, start, this.pos);
      case "]":
        return this.makeToken(TokenKind.RBracket, start, this.pos);
      case "{":
        return this.makeToken(TokenKind.LBrace, start, this.pos);
      case "}":
        return this.makeToken(TokenKind.RBrace, start, this.pos);
      case ",":
        return this.makeToken(TokenKind.Comma, start, this.pos);
      case ";":
        return this.makeToken(TokenKind.Semicolon, start, this.pos);
      case "%":
        return this.makeToken(TokenKind.Percent, start, this.pos);
      case "^":
        return this.makeToken(TokenKind.Caret, start, this.pos);
      case "?":
        return this.makeToken(TokenKind.Question, start, this.pos);

      // Potentially multi-character tokens
      case "+":
        if (this.match("+")) {
          return this.makeToken(TokenKind.Concat, start, this.pos);
        }
        return this.makeToken(TokenKind.Plus, start, this.pos);

      case "-":
        if (this.match(">")) {
          return this.makeToken(TokenKind.Arrow, start, this.pos);
        }
        return this.makeToken(TokenKind.Minus, start, this.pos);

      case "*":
        return this.makeToken(TokenKind.Star, start, this.pos);

      case "/":
        return this.makeToken(TokenKind.Slash, start, this.pos);

      case "=":
        if (this.match("=")) {
          return this.makeToken(TokenKind.EqEq, start, this.pos);
        }
        return this.makeToken(TokenKind.Eq, start, this.pos);

      case "!":
        if (this.match("=")) {
          return this.makeToken(TokenKind.NotEq, start, this.pos);
        }
        return this.makeToken(TokenKind.Not, start, this.pos);

      case "<":
        if (this.match("=")) {
          return this.makeToken(TokenKind.LtEq, start, this.pos);
        }
        if (this.match("-")) {
          return this.makeToken(TokenKind.LeftArrow, start, this.pos);
        }
        return this.makeToken(TokenKind.Lt, start, this.pos);

      case ">":
        if (this.match("=")) {
          return this.makeToken(TokenKind.GtEq, start, this.pos);
        }
        return this.makeToken(TokenKind.Gt, start, this.pos);

      case "&":
        if (this.match("&")) {
          return this.makeToken(TokenKind.And, start, this.pos);
        }
        return this.errorToken("Unexpected character '&'. Did you mean '&&'?", start, this.pos);

      case "|":
        if (this.match(">")) {
          return this.makeToken(TokenKind.Pipe, start, this.pos);
        }
        if (this.match("|")) {
          return this.makeToken(TokenKind.Or, start, this.pos);
        }
        // Single | used in refinement types: T{x | predicate}
        return this.makeToken(TokenKind.Bar, start, this.pos);

      case ":":
        if (this.match(":")) {
          return this.makeToken(TokenKind.ColonColon, start, this.pos);
        }
        return this.makeToken(TokenKind.Colon, start, this.pos);

      case ".":
        if (this.match(".")) {
          return this.makeToken(TokenKind.DotDot, start, this.pos);
        }
        // Check for float starting with .
        if (isDigit(this.peek())) {
          // Go back and scan as number
          this.pos = start;
          return this.scanNumber();
        }
        return this.makeToken(TokenKind.Dot, start, this.pos);

      case "\\":
        return this.makeToken(TokenKind.Lambda, start, this.pos);

      case "_":
        // Check if it's a standalone underscore or start of identifier
        if (!isIdentifierContinue(this.peek())) {
          return this.makeToken(TokenKind.Underscore, start, this.pos);
        }
        // It's part of an identifier, go back and scan properly
        this.pos = start;
        return this.scanIdentifier();

      default:
        return this.errorToken(`Unexpected character: '${char}'`, start, this.pos);
    }
  }
}

/**
 * Tokenize a source file
 */
export function tokenize(source: SourceFile): { tokens: Token[]; errors: LexerError[] } {
  const lexer = new Lexer(source);
  const tokens = lexer.tokenize();
  return { tokens, errors: lexer.getErrors() };
}

/**
 * Tokenize a string (convenience function for testing)
 */
export function tokenizeString(
  content: string,
  filename: string = "<input>"
): { tokens: Token[]; errors: LexerError[] } {
  const source = new SourceFile(filename, content);
  return tokenize(source);
}
