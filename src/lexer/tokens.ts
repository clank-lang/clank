/**
 * Token type definitions for the Axon lexer
 */

import type { SourceSpan } from "../utils/span";

export enum TokenKind {
  // Literals
  IntLit = "IntLit",
  FloatLit = "FloatLit",
  StringLit = "StringLit",
  TemplateLit = "TemplateLit",
  True = "True",
  False = "False",

  // Keywords
  Fn = "Fn", // ƒ or fn
  Lambda = "Lambda", // λ or \
  Let = "Let",
  Mut = "Mut",
  If = "If",
  Else = "Else",
  Match = "Match",
  For = "For",
  In = "In",
  While = "While",
  Loop = "Loop",
  Return = "Return",
  Break = "Break",
  Continue = "Continue",
  Type = "Type",
  Rec = "Rec",
  Sum = "Sum",
  Mod = "Mod",
  Use = "Use",
  External = "External",
  Pre = "Pre",
  Post = "Post",
  Assert = "Assert",
  Unsafe = "Unsafe",
  Js = "Js",

  // Operators
  Plus = "Plus", // +
  Minus = "Minus", // -
  Star = "Star", // *
  Slash = "Slash", // /
  Percent = "Percent", // %
  Caret = "Caret", // ^
  EqEq = "EqEq", // ==
  NotEq = "NotEq", // ≠ or !=
  Lt = "Lt", // <
  Gt = "Gt", // >
  LtEq = "LtEq", // ≤ or <=
  GtEq = "GtEq", // ≥ or >=
  And = "And", // ∧ or &&
  Or = "Or", // ∨ or ||
  Not = "Not", // ¬ or !
  Arrow = "Arrow", // → or ->
  LeftArrow = "LeftArrow", // ← or <-
  Pipe = "Pipe", // |>
  Concat = "Concat", // ++
  Question = "Question", // ?
  Eq = "Eq", // =

  // Delimiters
  LParen = "LParen", // (
  RParen = "RParen", // )
  LBracket = "LBracket", // [
  RBracket = "RBracket", // ]
  LBrace = "LBrace", // {
  RBrace = "RBrace", // }
  Comma = "Comma", // ,
  Colon = "Colon", // :
  ColonColon = "ColonColon", // ::
  Semicolon = "Semicolon", // ;
  Dot = "Dot", // .
  DotDot = "DotDot", // ..

  // Identifiers
  Ident = "Ident", // lowercase identifiers
  TypeIdent = "TypeIdent", // uppercase identifiers
  Underscore = "Underscore", // _

  // Built-in type keywords (Unicode and ASCII variants)
  IntType = "IntType", // ℤ or Int
  NatType = "NatType", // ℕ or Nat
  FloatType = "FloatType", // ℝ or Float
  BoolType = "BoolType", // Bool
  StrType = "StrType", // Str
  UnitType = "UnitType", // Unit

  // Special
  Eof = "Eof",
  Error = "Error",
}

export type IntSuffix = "i32" | "i64" | null;

export interface TokenValue {
  int?: { value: bigint; suffix: IntSuffix };
  float?: number;
  string?: string;
  ident?: string;
  error?: string;
}

export interface Token {
  kind: TokenKind;
  span: SourceSpan;
  value?: TokenValue;
}

export function token(kind: TokenKind, span: SourceSpan, value?: TokenValue): Token {
  if (value !== undefined) {
    return { kind, span, value };
  }
  return { kind, span };
}

export function tokenKindName(kind: TokenKind): string {
  return kind;
}

/**
 * Map of reserved keywords to their token kinds
 */
export const KEYWORDS: Map<string, TokenKind> = new Map([
  // ASCII keywords
  ["fn", TokenKind.Fn],
  ["let", TokenKind.Let],
  ["mut", TokenKind.Mut],
  ["if", TokenKind.If],
  ["else", TokenKind.Else],
  ["match", TokenKind.Match],
  ["for", TokenKind.For],
  ["in", TokenKind.In],
  ["while", TokenKind.While],
  ["loop", TokenKind.Loop],
  ["return", TokenKind.Return],
  ["break", TokenKind.Break],
  ["continue", TokenKind.Continue],
  ["type", TokenKind.Type],
  ["rec", TokenKind.Rec],
  ["sum", TokenKind.Sum],
  ["mod", TokenKind.Mod],
  ["use", TokenKind.Use],
  ["external", TokenKind.External],
  ["pre", TokenKind.Pre],
  ["post", TokenKind.Post],
  ["assert", TokenKind.Assert],
  ["unsafe", TokenKind.Unsafe],
  ["js", TokenKind.Js],
  ["true", TokenKind.True],
  ["false", TokenKind.False],

  // Built-in types (ASCII)
  ["Int", TokenKind.IntType],
  ["Int32", TokenKind.IntType],
  ["Int64", TokenKind.IntType],
  ["Nat", TokenKind.NatType],
  ["Float", TokenKind.FloatType],
  ["Bool", TokenKind.BoolType],
  ["Str", TokenKind.StrType],
  ["Unit", TokenKind.UnitType],
]);

/**
 * Map of Unicode symbols to their token kinds
 */
export const UNICODE_SYMBOLS: Map<string, TokenKind> = new Map([
  ["ƒ", TokenKind.Fn],
  ["λ", TokenKind.Lambda],
  ["→", TokenKind.Arrow],
  ["←", TokenKind.LeftArrow],
  ["≠", TokenKind.NotEq],
  ["≤", TokenKind.LtEq],
  ["≥", TokenKind.GtEq],
  ["∧", TokenKind.And],
  ["∨", TokenKind.Or],
  ["¬", TokenKind.Not],
  ["ℤ", TokenKind.IntType],
  ["ℕ", TokenKind.NatType],
  ["ℝ", TokenKind.FloatType],
]);

/**
 * Get a human-readable description of a token for error messages
 */
export function describeToken(tok: Token): string {
  switch (tok.kind) {
    case TokenKind.IntLit:
      return `integer '${tok.value?.int?.value}'`;
    case TokenKind.FloatLit:
      return `float '${tok.value?.float}'`;
    case TokenKind.StringLit:
      return `string`;
    case TokenKind.TemplateLit:
      return `template string`;
    case TokenKind.Ident:
      return `identifier '${tok.value?.ident}'`;
    case TokenKind.TypeIdent:
      return `type identifier '${tok.value?.ident}'`;
    case TokenKind.Eof:
      return "end of file";
    case TokenKind.Error:
      return `error: ${tok.value?.error}`;
    default:
      return `'${tok.kind}'`;
  }
}
