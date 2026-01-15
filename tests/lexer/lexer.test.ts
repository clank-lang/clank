/**
 * Lexer Tests
 */

import { describe, test, expect } from "bun:test";
import { tokenizeString, TokenKind, type Token } from "../../src/lexer";

function tokenKinds(content: string): TokenKind[] {
  const { tokens } = tokenizeString(content);
  return tokens.map((t) => t.kind);
}

function firstToken(content: string): Token {
  const { tokens } = tokenizeString(content);
  return tokens[0];
}

describe("Lexer", () => {
  describe("Whitespace and Comments", () => {
    test("skips whitespace", () => {
      expect(tokenKinds("   \t\n\r  ")).toEqual([TokenKind.Eof]);
    });

    test("skips single-line comments", () => {
      expect(tokenKinds("// comment\n42")).toEqual([TokenKind.IntLit, TokenKind.Eof]);
    });

    test("skips multi-line comments", () => {
      expect(tokenKinds("/* comment */ 42")).toEqual([TokenKind.IntLit, TokenKind.Eof]);
    });

    test("handles nested multi-line comments", () => {
      expect(tokenKinds("/* outer /* inner */ still outer */ 42")).toEqual([
        TokenKind.IntLit,
        TokenKind.Eof,
      ]);
    });
  });

  describe("Integer Literals", () => {
    test("decimal integers", () => {
      const tok = firstToken("42");
      expect(tok.kind).toBe(TokenKind.IntLit);
      expect(tok.value?.int?.value).toBe(42n);
      expect(tok.value?.int?.suffix).toBeNull();
    });

    test("integers with underscores", () => {
      const tok = firstToken("1_000_000");
      expect(tok.kind).toBe(TokenKind.IntLit);
      expect(tok.value?.int?.value).toBe(1000000n);
    });

    test("hex integers", () => {
      const tok = firstToken("0xFF");
      expect(tok.kind).toBe(TokenKind.IntLit);
      expect(tok.value?.int?.value).toBe(255n);
    });

    test("binary integers", () => {
      const tok = firstToken("0b1010");
      expect(tok.kind).toBe(TokenKind.IntLit);
      expect(tok.value?.int?.value).toBe(10n);
    });

    test("i32 suffix", () => {
      const tok = firstToken("42i32");
      expect(tok.kind).toBe(TokenKind.IntLit);
      expect(tok.value?.int?.value).toBe(42n);
      expect(tok.value?.int?.suffix).toBe("i32");
    });

    test("i64 suffix", () => {
      const tok = firstToken("42i64");
      expect(tok.kind).toBe(TokenKind.IntLit);
      expect(tok.value?.int?.value).toBe(42n);
      expect(tok.value?.int?.suffix).toBe("i64");
    });
  });

  describe("Float Literals", () => {
    test("simple float", () => {
      const tok = firstToken("3.14");
      expect(tok.kind).toBe(TokenKind.FloatLit);
      expect(tok.value?.float).toBeCloseTo(3.14);
    });

    test("float with exponent", () => {
      const tok = firstToken("1e10");
      expect(tok.kind).toBe(TokenKind.FloatLit);
      expect(tok.value?.float).toBe(1e10);
    });

    test("float with negative exponent", () => {
      const tok = firstToken("1.5e-3");
      expect(tok.kind).toBe(TokenKind.FloatLit);
      expect(tok.value?.float).toBeCloseTo(0.0015);
    });

    test("leading dot float", () => {
      const tok = firstToken(".5");
      expect(tok.kind).toBe(TokenKind.FloatLit);
      expect(tok.value?.float).toBeCloseTo(0.5);
    });
  });

  describe("String Literals", () => {
    test("simple string", () => {
      const tok = firstToken('"hello"');
      expect(tok.kind).toBe(TokenKind.StringLit);
      expect(tok.value?.string).toBe("hello");
    });

    test("string with escape sequences", () => {
      const tok = firstToken('"line1\\nline2"');
      expect(tok.kind).toBe(TokenKind.StringLit);
      expect(tok.value?.string).toBe("line1\nline2");
    });

    test("string with all escape sequences", () => {
      const tok = firstToken('"\\n\\r\\t\\\\\\"\\0"');
      expect(tok.kind).toBe(TokenKind.StringLit);
      expect(tok.value?.string).toBe('\n\r\t\\"\0');
    });

    test("unterminated string error", () => {
      const { errors } = tokenizeString('"unterminated');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain("Unterminated");
    });
  });

  describe("Template Literals", () => {
    test("simple template", () => {
      const tok = firstToken("`hello`");
      expect(tok.kind).toBe(TokenKind.TemplateLit);
      expect(tok.value?.string).toBe("hello");
    });

    test("template with interpolation", () => {
      const tok = firstToken("`hello ${name}!`");
      expect(tok.kind).toBe(TokenKind.TemplateLit);
      expect(tok.value?.string).toBe("hello ${name}!");
    });
  });

  describe("Keywords", () => {
    test("function keyword (ASCII)", () => {
      expect(firstToken("fn").kind).toBe(TokenKind.Fn);
    });

    test("let keyword", () => {
      expect(firstToken("let").kind).toBe(TokenKind.Let);
    });

    test("mut keyword", () => {
      expect(firstToken("mut").kind).toBe(TokenKind.Mut);
    });

    test("if/else keywords", () => {
      expect(tokenKinds("if else")).toEqual([TokenKind.If, TokenKind.Else, TokenKind.Eof]);
    });

    test("match keyword", () => {
      expect(firstToken("match").kind).toBe(TokenKind.Match);
    });

    test("for/in keywords", () => {
      expect(tokenKinds("for in")).toEqual([TokenKind.For, TokenKind.In, TokenKind.Eof]);
    });

    test("while/loop keywords", () => {
      expect(tokenKinds("while loop")).toEqual([
        TokenKind.While,
        TokenKind.Loop,
        TokenKind.Eof,
      ]);
    });

    test("control flow keywords", () => {
      expect(tokenKinds("return break continue")).toEqual([
        TokenKind.Return,
        TokenKind.Break,
        TokenKind.Continue,
        TokenKind.Eof,
      ]);
    });

    test("type keywords", () => {
      expect(tokenKinds("type rec sum")).toEqual([
        TokenKind.Type,
        TokenKind.Rec,
        TokenKind.Sum,
        TokenKind.Eof,
      ]);
    });

    test("module keywords", () => {
      expect(tokenKinds("mod use external")).toEqual([
        TokenKind.Mod,
        TokenKind.Use,
        TokenKind.External,
        TokenKind.Eof,
      ]);
    });

    test("contract keywords", () => {
      expect(tokenKinds("pre post assert")).toEqual([
        TokenKind.Pre,
        TokenKind.Post,
        TokenKind.Assert,
        TokenKind.Eof,
      ]);
    });

    test("unsafe/js keywords", () => {
      expect(tokenKinds("unsafe js")).toEqual([
        TokenKind.Unsafe,
        TokenKind.Js,
        TokenKind.Eof,
      ]);
    });

    test("boolean literals", () => {
      expect(tokenKinds("true false")).toEqual([
        TokenKind.True,
        TokenKind.False,
        TokenKind.Eof,
      ]);
    });
  });

  describe("Unicode Keywords and Symbols", () => {
    test("function symbol ƒ", () => {
      expect(firstToken("ƒ").kind).toBe(TokenKind.Fn);
    });

    test("lambda symbol λ", () => {
      expect(firstToken("λ").kind).toBe(TokenKind.Lambda);
    });

    test("arrow symbol →", () => {
      expect(firstToken("→").kind).toBe(TokenKind.Arrow);
    });

    test("left arrow symbol ←", () => {
      expect(firstToken("←").kind).toBe(TokenKind.LeftArrow);
    });

    test("not equal symbol ≠", () => {
      expect(firstToken("≠").kind).toBe(TokenKind.NotEq);
    });

    test("less or equal symbol ≤", () => {
      expect(firstToken("≤").kind).toBe(TokenKind.LtEq);
    });

    test("greater or equal symbol ≥", () => {
      expect(firstToken("≥").kind).toBe(TokenKind.GtEq);
    });

    test("logical and symbol ∧", () => {
      expect(firstToken("∧").kind).toBe(TokenKind.And);
    });

    test("logical or symbol ∨", () => {
      expect(firstToken("∨").kind).toBe(TokenKind.Or);
    });

    test("logical not symbol ¬", () => {
      expect(firstToken("¬").kind).toBe(TokenKind.Not);
    });

    test("integer type symbol ℤ", () => {
      expect(firstToken("ℤ").kind).toBe(TokenKind.IntType);
    });

    test("natural type symbol ℕ", () => {
      expect(firstToken("ℕ").kind).toBe(TokenKind.NatType);
    });

    test("real type symbol ℝ", () => {
      expect(firstToken("ℝ").kind).toBe(TokenKind.FloatType);
    });
  });

  describe("Type Keywords (ASCII)", () => {
    test("Int type", () => {
      expect(firstToken("Int").kind).toBe(TokenKind.IntType);
    });

    test("Int32 type", () => {
      expect(firstToken("Int32").kind).toBe(TokenKind.IntType);
    });

    test("Int64 type", () => {
      expect(firstToken("Int64").kind).toBe(TokenKind.IntType);
    });

    test("Nat type", () => {
      expect(firstToken("Nat").kind).toBe(TokenKind.NatType);
    });

    test("Float type", () => {
      expect(firstToken("Float").kind).toBe(TokenKind.FloatType);
    });

    test("Bool type", () => {
      expect(firstToken("Bool").kind).toBe(TokenKind.BoolType);
    });

    test("Str type", () => {
      expect(firstToken("Str").kind).toBe(TokenKind.StrType);
    });

    test("Unit type", () => {
      expect(firstToken("Unit").kind).toBe(TokenKind.UnitType);
    });
  });

  describe("Identifiers", () => {
    test("simple identifier", () => {
      const tok = firstToken("foo");
      expect(tok.kind).toBe(TokenKind.Ident);
      expect(tok.value?.ident).toBe("foo");
    });

    test("identifier with underscores", () => {
      const tok = firstToken("foo_bar");
      expect(tok.kind).toBe(TokenKind.Ident);
      expect(tok.value?.ident).toBe("foo_bar");
    });

    test("identifier with numbers", () => {
      const tok = firstToken("foo123");
      expect(tok.kind).toBe(TokenKind.Ident);
      expect(tok.value?.ident).toBe("foo123");
    });

    test("type identifier (uppercase)", () => {
      const tok = firstToken("MyType");
      expect(tok.kind).toBe(TokenKind.TypeIdent);
      expect(tok.value?.ident).toBe("MyType");
    });

    test("underscore as wildcard", () => {
      expect(firstToken("_").kind).toBe(TokenKind.Underscore);
    });
  });

  describe("Operators", () => {
    test("arithmetic operators", () => {
      expect(tokenKinds("+ - * / % ^")).toEqual([
        TokenKind.Plus,
        TokenKind.Minus,
        TokenKind.Star,
        TokenKind.Slash,
        TokenKind.Percent,
        TokenKind.Caret,
        TokenKind.Eof,
      ]);
    });

    test("comparison operators (ASCII)", () => {
      expect(tokenKinds("== != < > <= >=")).toEqual([
        TokenKind.EqEq,
        TokenKind.NotEq,
        TokenKind.Lt,
        TokenKind.Gt,
        TokenKind.LtEq,
        TokenKind.GtEq,
        TokenKind.Eof,
      ]);
    });

    test("logical operators (ASCII)", () => {
      expect(tokenKinds("&& || !")).toEqual([
        TokenKind.And,
        TokenKind.Or,
        TokenKind.Not,
        TokenKind.Eof,
      ]);
    });

    test("arrow operators", () => {
      expect(tokenKinds("-> <-")).toEqual([
        TokenKind.Arrow,
        TokenKind.LeftArrow,
        TokenKind.Eof,
      ]);
    });

    test("pipe and concat operators", () => {
      expect(tokenKinds("|> ++")).toEqual([TokenKind.Pipe, TokenKind.Concat, TokenKind.Eof]);
    });

    test("assignment and question", () => {
      expect(tokenKinds("= ?")).toEqual([TokenKind.Eq, TokenKind.Question, TokenKind.Eof]);
    });
  });

  describe("Delimiters", () => {
    test("parentheses", () => {
      expect(tokenKinds("( )")).toEqual([TokenKind.LParen, TokenKind.RParen, TokenKind.Eof]);
    });

    test("brackets", () => {
      expect(tokenKinds("[ ]")).toEqual([
        TokenKind.LBracket,
        TokenKind.RBracket,
        TokenKind.Eof,
      ]);
    });

    test("braces", () => {
      expect(tokenKinds("{ }")).toEqual([TokenKind.LBrace, TokenKind.RBrace, TokenKind.Eof]);
    });

    test("punctuation", () => {
      expect(tokenKinds(", ; : :: . ..")).toEqual([
        TokenKind.Comma,
        TokenKind.Semicolon,
        TokenKind.Colon,
        TokenKind.ColonColon,
        TokenKind.Dot,
        TokenKind.DotDot,
        TokenKind.Eof,
      ]);
    });

    test("lambda backslash", () => {
      expect(firstToken("\\").kind).toBe(TokenKind.Lambda);
    });
  });

  describe("Source Spans", () => {
    test("tracks position correctly", () => {
      const tok = firstToken("  foo");
      expect(tok.span.start.line).toBe(1);
      expect(tok.span.start.column).toBe(3);
      expect(tok.span.end.column).toBe(6);
    });

    test("tracks multi-line positions", () => {
      const { tokens } = tokenizeString("foo\nbar");
      expect(tokens[0].span.start.line).toBe(1);
      expect(tokens[1].span.start.line).toBe(2);
      expect(tokens[1].span.start.column).toBe(1);
    });
  });

  describe("Complete Programs", () => {
    test("hello world", () => {
      const code = `
        ƒ main() → IO[()] {
          println("Hello, Axon!")
        }
      `;
      const { tokens, errors } = tokenizeString(code);
      expect(errors).toHaveLength(0);
      expect(tokens.filter((t) => t.kind !== TokenKind.Eof).length).toBeGreaterThan(0);
    });

    test("function with refinement type", () => {
      const code = `ƒ div(n: ℤ, d: ℤ{d ≠ 0}) → ℤ { n / d }`;
      const { tokens, errors } = tokenizeString(code);
      expect(errors).toHaveLength(0);

      const kinds = tokens.map((t) => t.kind);
      expect(kinds).toContain(TokenKind.Fn);
      expect(kinds).toContain(TokenKind.IntType);
      expect(kinds).toContain(TokenKind.NotEq);
    });

    test("lambda expression", () => {
      const code = `λx → x + 1`;
      const kinds = tokenKinds(code);
      expect(kinds).toEqual([
        TokenKind.Lambda,
        TokenKind.Ident,
        TokenKind.Arrow,
        TokenKind.Ident,
        TokenKind.Plus,
        TokenKind.IntLit,
        TokenKind.Eof,
      ]);
    });

    test("match expression", () => {
      const code = `match x { Some(v) → v, None → 0 }`;
      const { tokens, errors } = tokenizeString(code);
      expect(errors).toHaveLength(0);

      const kinds = tokens.map((t) => t.kind);
      expect(kinds).toContain(TokenKind.Match);
      expect(kinds).toContain(TokenKind.Arrow);
    });

    test("pipeline expression", () => {
      const code = `x |> map(λy → y * 2) |> filter(λy → y > 0)`;
      const kinds = tokenKinds(code);
      expect(kinds.filter((k) => k === TokenKind.Pipe)).toHaveLength(2);
      expect(kinds.filter((k) => k === TokenKind.Lambda)).toHaveLength(2);
    });
  });
});
