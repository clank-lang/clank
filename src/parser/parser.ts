/**
 * Axon Parser
 *
 * Recursive descent parser that transforms a token stream into an AST.
 */

import type { SourceSpan } from "../utils/span";
import { mergeSpans } from "../utils/span";
import type { Token } from "../lexer/tokens";
import { TokenKind } from "../lexer/tokens";
import {
  generateNodeId,
  resetNodeIdCounter,
  type Program,
  type Decl,
  type Stmt,
  type Expr,
  type TypeExpr,
  type Pattern,
  type BinaryOp,
  type UnaryOp,
  type TypeParam,
  type FnParam,
  type RecField,
  type SumVariant,
  type SumVariantField,
  type LambdaParam,
  type MatchArm,
  type BlockExpr,
  type IfExpr,
  type FnDecl,
  type ExternalFnDecl,
} from "./ast";

// =============================================================================
// Parser Error
// =============================================================================

export interface ParseError {
  message: string;
  span: SourceSpan;
  expected?: string[] | undefined;
}

// =============================================================================
// Parser Class
// =============================================================================

export class Parser {
  private tokens: Token[];
  private pos: number = 0;
  private errors: ParseError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  getErrors(): ParseError[] {
    return this.errors;
  }

  /**
   * Public method to parse a single expression.
   */
  parseExpressionPublic(): Expr | undefined {
    try {
      return this.parseExpr();
    } catch {
      return undefined;
    }
  }

  /**
   * Public method to parse a single type expression.
   */
  parseTypeExprPublic(): TypeExpr | undefined {
    try {
      return this.parseTypeExpr();
    } catch {
      return undefined;
    }
  }

  /**
   * Public method to parse a single pattern.
   */
  parsePatternPublic(): Pattern | undefined {
    try {
      return this.parsePattern();
    } catch {
      return undefined;
    }
  }

  // ===========================================================================
  // Token Navigation
  // ===========================================================================

  private isAtEnd(): boolean {
    return this.peek().kind === TokenKind.Eof;
  }

  private peek(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  private peekNext(): Token {
    return this.tokens[this.pos + 1] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return this.tokens[this.pos - 1];
  }

  private check(kind: TokenKind): boolean {
    return this.peek().kind === kind;
  }

  private checkAny(...kinds: TokenKind[]): boolean {
    return kinds.includes(this.peek().kind);
  }

  private match(...kinds: TokenKind[]): boolean {
    for (const kind of kinds) {
      if (this.check(kind)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private expect(kind: TokenKind, message: string): Token {
    if (this.check(kind)) {
      return this.advance();
    }
    throw this.error(message, [kind.toString()]);
  }

  private error(message: string, expected?: string[]): ParseError {
    const err: ParseError = {
      message,
      span: this.peek().span,
      expected,
    };
    this.errors.push(err);
    return err;
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      // Sync at statement boundaries
      if (this.checkAny(
        TokenKind.Fn,
        TokenKind.Let,
        TokenKind.Type,
        TokenKind.Rec,
        TokenKind.Sum,
        TokenKind.Mod,
        TokenKind.Use,
        TokenKind.External,
        TokenKind.If,
        TokenKind.For,
        TokenKind.While,
        TokenKind.Return,
        TokenKind.RBrace
      )) {
        return;
      }
      this.advance();
    }
  }

  // ===========================================================================
  // Program Parsing
  // ===========================================================================

  parse(): Program {
    const declarations: Decl[] = [];
    const start = this.peek().span;

    while (!this.isAtEnd()) {
      try {
        const decl = this.parseDeclaration();
        if (decl) {
          declarations.push(decl);
        }
      } catch {
        this.synchronize();
      }
    }

    const end = this.tokens[this.tokens.length - 1].span;
    return {
      kind: "program",
      id: generateNodeId(),
      span: mergeSpans(start, end),
      declarations,
    };
  }

  // ===========================================================================
  // Declaration Parsing
  // ===========================================================================

  private parseDeclaration(): Decl | null {
    if (this.match(TokenKind.Mod)) {
      return this.parseModDecl();
    }
    if (this.match(TokenKind.Use)) {
      return this.parseUseDecl();
    }
    if (this.match(TokenKind.Type)) {
      return this.parseTypeAliasDecl();
    }
    if (this.match(TokenKind.Rec)) {
      return this.parseRecDecl();
    }
    if (this.match(TokenKind.Sum)) {
      return this.parseSumDecl();
    }
    if (this.match(TokenKind.External)) {
      return this.parseExternalDecl();
    }
    if (this.check(TokenKind.Fn)) {
      return this.parseFnDecl();
    }

    throw this.error(`Expected declaration, got ${this.peek().kind}`);
  }

  private parseModDecl(): Decl {
    const start = this.tokens[this.pos - 1].span;
    const nameToken = this.expect(TokenKind.Ident, "Expected module name");
    const name = nameToken.value?.ident ?? "";

    return {
      kind: "mod",
      id: generateNodeId(),
      span: mergeSpans(start, nameToken.span),
      name,
    };
  }

  private parseUseDecl(): Decl {
    const start = this.tokens[this.pos - 1].span;
    const isExternal = this.match(TokenKind.External);

    // Parse path: std.io.print or just lodash
    const path: string[] = [];
    const firstToken = this.expect(
      isExternal ? TokenKind.StringLit : TokenKind.Ident,
      "Expected module path"
    );

    if (isExternal) {
      // use external "lodash" as _
      const jsModule = firstToken.value?.string ?? "";
      let alias: string | undefined;
      if (this.match(TokenKind.Ident) && this.tokens[this.pos - 1].value?.ident === "as") {
        const aliasToken = this.parseIdentOrUnderscore();
        alias = aliasToken;
      }
      return {
        kind: "use",
        id: generateNodeId(),
        span: mergeSpans(start, this.tokens[this.pos - 1].span),
        path: [jsModule],
        isExternal: true,
        alias,
      };
    }

    path.push(firstToken.value?.ident ?? "");

    while (this.match(TokenKind.Dot)) {
      if (this.match(TokenKind.LBrace)) {
        // use std.io.{print, read}
        const items: string[] = [];
        do {
          const item = this.expect(TokenKind.Ident, "Expected identifier");
          items.push(item.value?.ident ?? "");
        } while (this.match(TokenKind.Comma));
        this.expect(TokenKind.RBrace, "Expected '}'");

        return {
          kind: "use",
          id: generateNodeId(),
          span: mergeSpans(start, this.tokens[this.pos - 1].span),
          path,
          items,
          isExternal: false,
        };
      }

      const segment = this.expect(TokenKind.Ident, "Expected path segment");
      path.push(segment.value?.ident ?? "");
    }

    return {
      kind: "use",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      path,
      isExternal: false,
    };
  }

  private parseIdentOrUnderscore(): string {
    if (this.match(TokenKind.Underscore)) {
      return "_";
    }
    const tok = this.expect(TokenKind.Ident, "Expected identifier");
    return tok.value?.ident ?? "";
  }

  /**
   * Parse a type identifier or a built-in type keyword used as an identifier.
   * This is needed because sum variant names like "Bool", "String", etc.
   * are valid identifiers but get tokenized as type keywords.
   */
  private parseTypeIdentOrBuiltin(message: string): string {
    const result = this.tryParseVariantName();
    if (result !== null) {
      return result;
    }
    throw this.error(message, [TokenKind.TypeIdent]);
  }

  /**
   * Try to parse a variant name (TypeIdent or built-in type keyword).
   * Returns null if current token is not a valid variant name (does not advance).
   */
  private tryParseVariantName(): string | null {
    const tok = this.peek();

    // Accept TypeIdent
    if (this.match(TokenKind.TypeIdent)) {
      return tok.value?.ident ?? "";
    }

    // Accept built-in type keywords as identifiers
    if (this.match(TokenKind.BoolType)) return "Bool";
    if (this.match(TokenKind.IntType)) return "Int";
    if (this.match(TokenKind.NatType)) return "Nat";
    if (this.match(TokenKind.FloatType)) return "Float";
    if (this.match(TokenKind.StrType)) return "Str";
    if (this.match(TokenKind.UnitType)) return "Unit";

    return null;
  }

  private parseTypeAliasDecl(): Decl {
    const start = this.tokens[this.pos - 1].span;
    const nameToken = this.expect(TokenKind.TypeIdent, "Expected type name");
    const name = nameToken.value?.ident ?? "";

    const typeParams = this.parseOptionalTypeParams();

    this.expect(TokenKind.Eq, "Expected '='");
    const type = this.parseTypeExpr();

    return {
      kind: "typeAlias",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      name,
      typeParams,
      type,
    };
  }

  private parseRecDecl(): Decl {
    const start = this.tokens[this.pos - 1].span;
    const nameToken = this.expect(TokenKind.TypeIdent, "Expected record name");
    const name = nameToken.value?.ident ?? "";

    const typeParams = this.parseOptionalTypeParams();

    this.expect(TokenKind.LBrace, "Expected '{'");
    const fields: RecField[] = [];

    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      const fieldStart = this.peek().span;
      const fieldName = this.expect(TokenKind.Ident, "Expected field name");
      this.expect(TokenKind.Colon, "Expected ':'");
      const fieldType = this.parseTypeExpr();

      fields.push({
        name: fieldName.value?.ident ?? "",
        type: fieldType,
        span: mergeSpans(fieldStart, this.tokens[this.pos - 1].span),
      });

      if (!this.check(TokenKind.RBrace)) {
        this.expect(TokenKind.Comma, "Expected ',' or '}'");
      }
    }

    this.expect(TokenKind.RBrace, "Expected '}'");

    return {
      kind: "rec",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      name,
      typeParams,
      fields,
    };
  }

  private parseSumDecl(): Decl {
    const start = this.tokens[this.pos - 1].span;
    const nameToken = this.expect(TokenKind.TypeIdent, "Expected sum type name");
    const name = nameToken.value?.ident ?? "";

    const typeParams = this.parseOptionalTypeParams();

    this.expect(TokenKind.LBrace, "Expected '{'");
    const variants: SumVariant[] = [];

    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      const variantStart = this.peek().span;
      const variantName = this.parseTypeIdentOrBuiltin("Expected variant name");

      let fields: SumVariantField[] | undefined;
      if (this.match(TokenKind.LParen)) {
        fields = [];
        if (!this.check(TokenKind.RParen)) {
          do {
            // Check for named field: name: Type
            let fieldName: string | undefined;
            if (this.check(TokenKind.Ident) && this.peekNext().kind === TokenKind.Colon) {
              const nameToken = this.advance();
              fieldName = nameToken.value?.ident;
              this.advance(); // consume :
            }
            const fieldType = this.parseTypeExpr();
            fields.push({ name: fieldName, type: fieldType });
          } while (this.match(TokenKind.Comma));
        }
        this.expect(TokenKind.RParen, "Expected ')'");
      }

      variants.push({
        name: variantName,
        fields,
        span: mergeSpans(variantStart, this.tokens[this.pos - 1].span),
      });

      if (!this.check(TokenKind.RBrace)) {
        this.expect(TokenKind.Comma, "Expected ',' or '}'");
      }
    }

    this.expect(TokenKind.RBrace, "Expected '}'");

    return {
      kind: "sum",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      name,
      typeParams,
      variants,
    };
  }

  private parseExternalDecl(): Decl {
    const start = this.tokens[this.pos - 1].span;

    if (this.match(TokenKind.Fn)) {
      return this.parseExternalFnDecl(start);
    }

    if (this.match(TokenKind.Mod)) {
      return this.parseExternalModDecl(start);
    }

    throw this.error("Expected 'fn' or 'mod' after 'external'");
  }

  private parseExternalFnDecl(start: SourceSpan): ExternalFnDecl {
    const nameToken = this.expect(TokenKind.Ident, "Expected function name");
    const name = nameToken.value?.ident ?? "";

    const typeParams = this.parseOptionalTypeParams();

    this.expect(TokenKind.LParen, "Expected '('");
    const params = this.parseFnParams();
    this.expect(TokenKind.RParen, "Expected ')'");

    this.expect(TokenKind.Arrow, "Expected '->'");
    const returnType = this.parseTypeExpr(true); // Allow refinement in external fn (no body follows)

    this.expect(TokenKind.Eq, "Expected '='");
    const jsNameToken = this.expect(TokenKind.StringLit, "Expected JavaScript name string");
    const jsName = jsNameToken.value?.string ?? "";

    return {
      kind: "externalFn",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      name,
      typeParams,
      params,
      returnType,
      jsName,
    };
  }

  private parseExternalModDecl(start: SourceSpan): Decl {
    const nameToken = this.expect(TokenKind.Ident, "Expected module name");
    const name = nameToken.value?.ident ?? "";

    this.expect(TokenKind.Eq, "Expected '='");
    const jsModuleToken = this.expect(TokenKind.StringLit, "Expected npm module string");
    const jsModule = jsModuleToken.value?.string ?? "";

    this.expect(TokenKind.LBrace, "Expected '{'");
    const functions: ExternalFnDecl[] = [];

    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      this.expect(TokenKind.Fn, "Expected 'fn'");
      const fnDecl = this.parseExternalFnDeclWithoutJs();
      functions.push(fnDecl);
    }

    this.expect(TokenKind.RBrace, "Expected '}'");

    return {
      kind: "externalMod",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      name,
      jsModule,
      functions,
    };
  }

  private parseExternalFnDeclWithoutJs(): ExternalFnDecl {
    const start = this.tokens[this.pos - 1].span;
    const nameToken = this.expect(TokenKind.Ident, "Expected function name");
    const name = nameToken.value?.ident ?? "";

    const typeParams = this.parseOptionalTypeParams();

    this.expect(TokenKind.LParen, "Expected '('");
    const params = this.parseFnParams();
    this.expect(TokenKind.RParen, "Expected ')'");

    this.expect(TokenKind.Arrow, "Expected '->'");
    const returnType = this.parseTypeExpr(true); // Allow refinement in external fn

    return {
      kind: "externalFn",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      name,
      typeParams,
      params,
      returnType,
      jsName: name, // Use Axon name as JS name
    };
  }

  private parseFnDecl(): FnDecl {
    const start = this.peek().span;
    this.expect(TokenKind.Fn, "Expected 'fn'");

    const nameToken = this.expect(TokenKind.Ident, "Expected function name");
    const name = nameToken.value?.ident ?? "";

    const typeParams = this.parseOptionalTypeParams();

    this.expect(TokenKind.LParen, "Expected '('");
    const params = this.parseFnParams();
    this.expect(TokenKind.RParen, "Expected ')'");

    this.expect(TokenKind.Arrow, "Expected '->'");
    // Don't allow refinement types for the return type because { would be
    // ambiguous with the function body. If the user wants a refined return
    // type, they should use a postcondition instead.
    const returnType = this.parseTypeExpr(false);

    // Optional pre/post conditions
    let precondition: Expr | undefined;
    let postcondition: Expr | undefined;

    if (this.match(TokenKind.Pre)) {
      precondition = this.parseExpr();
    }
    if (this.match(TokenKind.Post)) {
      postcondition = this.parseExpr();
    }

    const body = this.parseBlock();

    return {
      kind: "fn",
      id: generateNodeId(),
      span: mergeSpans(start, body.span),
      name,
      typeParams,
      params,
      returnType,
      precondition,
      postcondition,
      body,
    };
  }

  private parseOptionalTypeParams(): TypeParam[] {
    if (!this.match(TokenKind.LBracket)) {
      return [];
    }

    const params: TypeParam[] = [];
    do {
      const nameToken = this.expect(TokenKind.TypeIdent, "Expected type parameter name");
      const name = nameToken.value?.ident ?? "";

      let constraint: TypeExpr | undefined;
      if (this.match(TokenKind.Colon)) {
        constraint = this.parseTypeExpr();
      }

      params.push({ name, constraint });
    } while (this.match(TokenKind.Comma));

    this.expect(TokenKind.RBracket, "Expected ']'");
    return params;
  }

  private parseFnParams(): FnParam[] {
    const params: FnParam[] = [];

    if (this.check(TokenKind.RParen)) {
      return params;
    }

    do {
      const paramStart = this.peek().span;
      const nameToken = this.expect(TokenKind.Ident, "Expected parameter name");
      this.expect(TokenKind.Colon, "Expected ':'");
      const paramType = this.parseTypeExpr();

      params.push({
        name: nameToken.value?.ident ?? "",
        type: paramType,
        span: mergeSpans(paramStart, this.tokens[this.pos - 1].span),
      });
    } while (this.match(TokenKind.Comma));

    return params;
  }

  // ===========================================================================
  // Type Expression Parsing
  // ===========================================================================

  /**
   * Parse a type expression.
   * @param allowRefinement Whether to allow refinement types (T{predicate}).
   *        Set to false when parsing return types to avoid ambiguity with function bodies.
   */
  private parseTypeExpr(allowRefinement: boolean = true): TypeExpr {
    return this.parseEffectType(allowRefinement);
  }

  private parseEffectType(allowRefinement: boolean): TypeExpr {
    let type = this.parseFunctionType(allowRefinement);

    // Check for effect combination: IO + Err[E, T]
    if (this.match(TokenKind.Plus)) {
      const effects: TypeExpr[] = [type];
      do {
        effects.push(this.parseFunctionType(allowRefinement));
      } while (this.match(TokenKind.Plus));

      // The last type is the result type
      const resultType = effects.pop()!;
      return {
        kind: "effect",
        id: generateNodeId(),
        span: mergeSpans(type.span, resultType.span),
        effects,
        resultType,
      };
    }

    return type;
  }

  private parseFunctionType(allowRefinement: boolean): TypeExpr {
    // Check for function type: (T, U) -> V
    if (this.check(TokenKind.LParen)) {
      const start = this.peek().span;
      this.advance();

      const params: TypeExpr[] = [];
      if (!this.check(TokenKind.RParen)) {
        do {
          params.push(this.parseTypeExpr(true)); // Allow refinement in function type params
        } while (this.match(TokenKind.Comma));
      }
      this.expect(TokenKind.RParen, "Expected ')'");

      if (this.match(TokenKind.Arrow)) {
        const returnType = this.parseTypeExpr(true); // Allow refinement in function type return
        return {
          kind: "function",
          id: generateNodeId(),
          span: mergeSpans(start, returnType.span),
          params,
          returnType,
        };
      }

      // It's a tuple type or unit
      if (params.length === 0) {
        return { kind: "named", id: generateNodeId(), span: start, name: "Unit", args: [] };
      }
      if (params.length === 1) {
        return params[0]; // Just parenthesized type
      }
      return {
        kind: "tuple",
        id: generateNodeId(),
        span: mergeSpans(start, this.tokens[this.pos - 1].span),
        elements: params,
      };
    }

    return this.parseArrayType(allowRefinement);
  }

  private parseArrayType(allowRefinement: boolean): TypeExpr {
    if (this.match(TokenKind.LBracket)) {
      const start = this.tokens[this.pos - 1].span;
      const element = this.parseTypeExpr(true); // Allow refinement in array element type
      this.expect(TokenKind.RBracket, "Expected ']'");

      const arrayType: TypeExpr = {
        kind: "array",
        id: generateNodeId(),
        span: mergeSpans(start, this.tokens[this.pos - 1].span),
        element,
      };

      // Check for refinement on the array type: [T]{predicate}
      if (allowRefinement && this.match(TokenKind.LBrace)) {
        // Check for explicit variable: [T]{x | predicate}
        let varName: string | undefined;
        if (this.check(TokenKind.Ident) && this.peekNext().kind === TokenKind.Bar) {
          const varToken = this.advance();
          varName = varToken.value?.ident;
          this.advance(); // consume |
        }

        const predicate = this.parseExpr();
        this.expect(TokenKind.RBrace, "Expected '}'");

        return {
          kind: "refined",
          id: generateNodeId(),
          span: mergeSpans(start, this.tokens[this.pos - 1].span),
          base: arrayType,
          varName,
          predicate,
        };
      }

      return arrayType;
    }

    return this.parseRefinedType(allowRefinement);
  }

  private parseRefinedType(allowRefinement: boolean): TypeExpr {
    const base = this.parsePrimaryType();

    // Check for refinement: T{predicate}
    // Only parse refinement if allowed (not in function return type position
    // where { would start the function body)
    if (allowRefinement && this.match(TokenKind.LBrace)) {
      const start = base.span;

      // Check for explicit variable: T{x | predicate}
      let varName: string | undefined;
      if (this.check(TokenKind.Ident) && this.peekNext().kind === TokenKind.Bar) {
        const varToken = this.advance();
        varName = varToken.value?.ident;
        this.advance(); // consume |
      }

      const predicate = this.parseExpr();
      this.expect(TokenKind.RBrace, "Expected '}'");

      return {
        kind: "refined",
        id: generateNodeId(),
        span: mergeSpans(start, this.tokens[this.pos - 1].span),
        base,
        varName,
        predicate,
      };
    }

    // Check for optional type sugar: T?
    if (this.match(TokenKind.Question)) {
      return {
        kind: "named",
        id: generateNodeId(),
        span: mergeSpans(base.span, this.tokens[this.pos - 1].span),
        name: "Option",
        args: [base],
      };
    }

    return base;
  }

  private parsePrimaryType(): TypeExpr {
    const tok = this.peek();

    // Built-in types
    if (this.match(TokenKind.IntType)) {
      return { kind: "named", id: generateNodeId(), span: tok.span, name: "Int", args: [] };
    }
    if (this.match(TokenKind.NatType)) {
      return { kind: "named", id: generateNodeId(), span: tok.span, name: "Nat", args: [] };
    }
    if (this.match(TokenKind.FloatType)) {
      return { kind: "named", id: generateNodeId(), span: tok.span, name: "Float", args: [] };
    }
    if (this.match(TokenKind.BoolType)) {
      return { kind: "named", id: generateNodeId(), span: tok.span, name: "Bool", args: [] };
    }
    if (this.match(TokenKind.StrType)) {
      return { kind: "named", id: generateNodeId(), span: tok.span, name: "Str", args: [] };
    }
    if (this.match(TokenKind.UnitType)) {
      return { kind: "named", id: generateNodeId(), span: tok.span, name: "Unit", args: [] };
    }

    // Named type with optional type args
    if (this.match(TokenKind.TypeIdent)) {
      const name = tok.value?.ident ?? "";
      const args: TypeExpr[] = [];

      if (this.match(TokenKind.LBracket)) {
        do {
          args.push(this.parseTypeExpr());
        } while (this.match(TokenKind.Comma));
        this.expect(TokenKind.RBracket, "Expected ']'");
      }

      return {
        kind: "named",
        id: generateNodeId(),
        span: args.length > 0 ? mergeSpans(tok.span, this.tokens[this.pos - 1].span) : tok.span,
        name,
        args,
      };
    }

    throw this.error(`Expected type, got ${tok.kind}`);
  }

  // ===========================================================================
  // Statement Parsing
  // ===========================================================================

  private parseStmt(): Stmt {
    if (this.match(TokenKind.Let)) {
      return this.parseLetStmt();
    }
    if (this.match(TokenKind.For)) {
      return this.parseForStmt();
    }
    if (this.match(TokenKind.While)) {
      return this.parseWhileStmt();
    }
    if (this.match(TokenKind.Loop)) {
      return this.parseLoopStmt();
    }
    if (this.match(TokenKind.Return)) {
      return this.parseReturnStmt();
    }
    if (this.match(TokenKind.Break)) {
      return { kind: "break", id: generateNodeId(), span: this.tokens[this.pos - 1].span };
    }
    if (this.match(TokenKind.Continue)) {
      return { kind: "continue", id: generateNodeId(), span: this.tokens[this.pos - 1].span };
    }
    if (this.match(TokenKind.Assert)) {
      return this.parseAssertStmt();
    }

    // Expression statement (possibly assignment)
    return this.parseExprOrAssignStmt();
  }

  private parseLetStmt(): Stmt {
    const start = this.tokens[this.pos - 1].span;
    const mutable = this.match(TokenKind.Mut);
    const pattern = this.parsePattern();

    let type: TypeExpr | undefined;
    if (this.match(TokenKind.Colon)) {
      type = this.parseTypeExpr();
    }

    this.expect(TokenKind.Eq, "Expected '='");
    const init = this.parseExpr();

    return {
      kind: "let",
      id: generateNodeId(),
      span: mergeSpans(start, init.span),
      pattern,
      mutable,
      type,
      init,
    };
  }

  private parseForStmt(): Stmt {
    const start = this.tokens[this.pos - 1].span;
    const pattern = this.parsePattern();
    this.expect(TokenKind.In, "Expected 'in'");
    const iterable = this.parseExpr();
    const body = this.parseBlock();

    return {
      kind: "for",
      id: generateNodeId(),
      span: mergeSpans(start, body.span),
      pattern,
      iterable,
      body,
    };
  }

  private parseWhileStmt(): Stmt {
    const start = this.tokens[this.pos - 1].span;
    const condition = this.parseExpr();
    const body = this.parseBlock();

    return {
      kind: "while",
      id: generateNodeId(),
      span: mergeSpans(start, body.span),
      condition,
      body,
    };
  }

  private parseLoopStmt(): Stmt {
    const start = this.tokens[this.pos - 1].span;
    const body = this.parseBlock();

    return {
      kind: "loop",
      id: generateNodeId(),
      span: mergeSpans(start, body.span),
      body,
    };
  }

  private parseReturnStmt(): Stmt {
    const start = this.tokens[this.pos - 1].span;

    // Check if there's a value (not followed by } or statement start)
    let value: Expr | undefined;
    if (!this.checkAny(TokenKind.RBrace, TokenKind.Semicolon) && !this.isAtEnd()) {
      value = this.parseExpr();
    }

    return {
      kind: "return",
      id: generateNodeId(),
      span: value ? mergeSpans(start, value.span) : start,
      value,
    };
  }

  private parseAssertStmt(): Stmt {
    const start = this.tokens[this.pos - 1].span;
    const condition = this.parseExpr();

    let message: string | undefined;
    if (this.match(TokenKind.Colon)) {
      const msgToken = this.expect(TokenKind.StringLit, "Expected message string");
      message = msgToken.value?.string;
    }

    return {
      kind: "assert",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      condition,
      message,
    };
  }

  private parseExprOrAssignStmt(): Stmt {
    const expr = this.parseExpr();

    if (this.match(TokenKind.Eq)) {
      const value = this.parseExpr();
      return {
        kind: "assign",
        id: generateNodeId(),
        span: mergeSpans(expr.span, value.span),
        target: expr,
        value,
      };
    }

    return {
      kind: "expr",
      id: generateNodeId(),
      span: expr.span,
      expr,
    };
  }

  // ===========================================================================
  // Expression Parsing (Pratt parser style with precedence)
  // ===========================================================================

  private parseExpr(): Expr {
    return this.parsePipeExpr();
  }

  private parsePipeExpr(): Expr {
    let expr = this.parseOrExpr();

    while (this.match(TokenKind.Pipe)) {
      const right = this.parseOrExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op: "|>",
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parseOrExpr(): Expr {
    let expr = this.parseAndExpr();

    while (this.match(TokenKind.Or)) {
      const right = this.parseAndExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op: "||",
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parseAndExpr(): Expr {
    let expr = this.parseEqualityExpr();

    while (this.match(TokenKind.And)) {
      const right = this.parseEqualityExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op: "&&",
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parseEqualityExpr(): Expr {
    let expr = this.parseComparisonExpr();

    while (this.checkAny(TokenKind.EqEq, TokenKind.NotEq)) {
      const op: BinaryOp = this.peek().kind === TokenKind.EqEq ? "==" : "!=";
      this.advance();
      const right = this.parseComparisonExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op,
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parseComparisonExpr(): Expr {
    let expr = this.parseConcatExpr();

    while (this.checkAny(TokenKind.Lt, TokenKind.Gt, TokenKind.LtEq, TokenKind.GtEq)) {
      const tok = this.advance();
      const op: BinaryOp =
        tok.kind === TokenKind.Lt ? "<" :
        tok.kind === TokenKind.Gt ? ">" :
        tok.kind === TokenKind.LtEq ? "<=" : ">=";
      const right = this.parseConcatExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op,
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parseConcatExpr(): Expr {
    let expr = this.parseAddExpr();

    while (this.match(TokenKind.Concat)) {
      const right = this.parseAddExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op: "++",
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parseAddExpr(): Expr {
    let expr = this.parseMulExpr();

    while (this.checkAny(TokenKind.Plus, TokenKind.Minus)) {
      const op: BinaryOp = this.peek().kind === TokenKind.Plus ? "+" : "-";
      this.advance();
      const right = this.parseMulExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op,
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parseMulExpr(): Expr {
    let expr = this.parsePowerExpr();

    while (this.checkAny(TokenKind.Star, TokenKind.Slash, TokenKind.Percent)) {
      const tok = this.advance();
      const op: BinaryOp =
        tok.kind === TokenKind.Star ? "*" :
        tok.kind === TokenKind.Slash ? "/" : "%";
      const right = this.parsePowerExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op,
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parsePowerExpr(): Expr {
    let expr = this.parseUnaryExpr();

    // Power is right-associative
    if (this.match(TokenKind.Caret)) {
      const right = this.parsePowerExpr();
      expr = {
        kind: "binary",
        id: generateNodeId(),
        span: mergeSpans(expr.span, right.span),
        op: "^",
        left: expr,
        right,
      };
    }

    return expr;
  }

  private parseUnaryExpr(): Expr {
    if (this.checkAny(TokenKind.Minus, TokenKind.Not)) {
      const start = this.peek().span;
      const op: UnaryOp = this.peek().kind === TokenKind.Minus ? "-" : "!";
      this.advance();
      const operand = this.parseUnaryExpr();
      return {
        kind: "unary",
        id: generateNodeId(),
        span: mergeSpans(start, operand.span),
        op,
        operand,
      };
    }

    return this.parsePostfixExpr();
  }

  private parsePostfixExpr(): Expr {
    let expr = this.parsePrimaryExpr();

    while (true) {
      if (this.match(TokenKind.LParen)) {
        // Function call
        const args: Expr[] = [];
        if (!this.check(TokenKind.RParen)) {
          do {
            args.push(this.parseExpr());
          } while (this.match(TokenKind.Comma));
        }
        this.expect(TokenKind.RParen, "Expected ')'");
        expr = {
          kind: "call",
          id: generateNodeId(),
          span: mergeSpans(expr.span, this.tokens[this.pos - 1].span),
          callee: expr,
          args,
        };
      } else if (this.match(TokenKind.LBracket)) {
        // Index access
        const index = this.parseExpr();
        this.expect(TokenKind.RBracket, "Expected ']'");
        expr = {
          kind: "index",
          id: generateNodeId(),
          span: mergeSpans(expr.span, this.tokens[this.pos - 1].span),
          object: expr,
          index,
        };
      } else if (this.match(TokenKind.Dot)) {
        // Field access
        const fieldToken = this.expect(TokenKind.Ident, "Expected field name");
        expr = {
          kind: "field",
          id: generateNodeId(),
          span: mergeSpans(expr.span, fieldToken.span),
          object: expr,
          field: fieldToken.value?.ident ?? "",
        };
      } else if (this.match(TokenKind.Question)) {
        // Error propagation
        expr = {
          kind: "propagate",
          id: generateNodeId(),
          span: mergeSpans(expr.span, this.tokens[this.pos - 1].span),
          expr,
        };
      } else {
        break;
      }
    }

    return expr;
  }

  private parsePrimaryExpr(): Expr {
    const tok = this.peek();

    // Literals
    if (this.match(TokenKind.IntLit)) {
      return {
        kind: "literal",
        id: generateNodeId(),
        span: tok.span,
        value: {
          kind: "int",
          value: tok.value?.int?.value ?? 0n,
          suffix: tok.value?.int?.suffix ?? null,
        },
      };
    }
    if (this.match(TokenKind.FloatLit)) {
      return {
        kind: "literal",
        id: generateNodeId(),
        span: tok.span,
        value: { kind: "float", value: tok.value?.float ?? 0 },
      };
    }
    if (this.match(TokenKind.StringLit)) {
      return {
        kind: "literal",
        id: generateNodeId(),
        span: tok.span,
        value: { kind: "string", value: tok.value?.string ?? "" },
      };
    }
    if (this.match(TokenKind.TemplateLit)) {
      return {
        kind: "literal",
        id: generateNodeId(),
        span: tok.span,
        value: { kind: "template", value: tok.value?.string ?? "" },
      };
    }
    if (this.match(TokenKind.True)) {
      return { kind: "literal", id: generateNodeId(), span: tok.span, value: { kind: "bool", value: true } };
    }
    if (this.match(TokenKind.False)) {
      return { kind: "literal", id: generateNodeId(), span: tok.span, value: { kind: "bool", value: false } };
    }

    // Identifier
    if (this.match(TokenKind.Ident)) {
      return { kind: "ident", id: generateNodeId(), span: tok.span, name: tok.value?.ident ?? "" };
    }

    // Type identifier (used as constructor)
    if (this.match(TokenKind.TypeIdent)) {
      const typeName = tok.value?.ident ?? "";

      // Detect attempted record literal: TypeIdent { ident : ...
      if (this.check(TokenKind.LBrace)) {
        const savedPos = this.pos;
        this.advance(); // {
        if (this.check(TokenKind.Ident)) {
          this.advance();
          if (this.check(TokenKind.Colon)) {
            this.pos = savedPos;
            throw this.error(
              `Record literal syntax '${typeName} { field: value }' is not supported. ` +
                `Use positional constructor: ${typeName}(value1, value2, ...)`
            );
          }
        }
        this.pos = savedPos;
      }

      return { kind: "ident", id: generateNodeId(), span: tok.span, name: typeName };
    }

    // Lambda: λx -> e or \x -> e or λ(x: T) -> e
    if (this.match(TokenKind.Lambda)) {
      return this.parseLambda(tok.span);
    }

    // If expression
    if (this.match(TokenKind.If)) {
      return this.parseIfExpr(tok.span);
    }

    // Match expression
    if (this.match(TokenKind.Match)) {
      return this.parseMatchExpr(tok.span);
    }

    // Block
    if (this.check(TokenKind.LBrace)) {
      return this.parseBlock();
    }

    // Array literal
    if (this.match(TokenKind.LBracket)) {
      return this.parseArrayLiteral(tok.span);
    }

    // Parenthesized expr, tuple, or unit
    if (this.match(TokenKind.LParen)) {
      return this.parseParenOrTuple(tok.span);
    }

    throw this.error(`Expected expression, got ${tok.kind}`);
  }

  private parseLambda(start: SourceSpan): Expr {
    const params: LambdaParam[] = [];

    if (this.match(TokenKind.LParen)) {
      // λ(x: T, y: U) -> e
      if (!this.check(TokenKind.RParen)) {
        do {
          const nameToken = this.expect(TokenKind.Ident, "Expected parameter name");
          let type: TypeExpr | undefined;
          if (this.match(TokenKind.Colon)) {
            type = this.parseTypeExpr();
          }
          params.push({ name: nameToken.value?.ident ?? "", type });
        } while (this.match(TokenKind.Comma));
      }
      this.expect(TokenKind.RParen, "Expected ')'");
    } else if (this.check(TokenKind.Ident)) {
      // λx -> e (single param, no type)
      const nameToken = this.advance();
      params.push({ name: nameToken.value?.ident ?? "" });
    }

    this.expect(TokenKind.Arrow, "Expected '->'");
    const body = this.parseExpr();

    return {
      kind: "lambda",
      id: generateNodeId(),
      span: mergeSpans(start, body.span),
      params,
      body,
    };
  }

  private parseIfExpr(start: SourceSpan): Expr {
    const condition = this.parseExpr();
    const thenBranch = this.parseBlock();

    let elseBranch: BlockExpr | IfExpr | undefined;
    if (this.match(TokenKind.Else)) {
      if (this.check(TokenKind.If)) {
        this.advance();
        elseBranch = this.parseIfExpr(this.tokens[this.pos - 1].span) as IfExpr;
      } else {
        elseBranch = this.parseBlock();
      }
    }

    return {
      kind: "if",
      id: generateNodeId(),
      span: mergeSpans(start, (elseBranch ?? thenBranch).span),
      condition,
      thenBranch,
      elseBranch,
    };
  }

  private parseMatchExpr(start: SourceSpan): Expr {
    const scrutinee = this.parseExpr();
    this.expect(TokenKind.LBrace, "Expected '{'");

    const arms: MatchArm[] = [];
    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      const armStart = this.peek().span;
      const pattern = this.parsePattern();

      let guard: Expr | undefined;
      if (this.match(TokenKind.If)) {
        guard = this.parseExpr();
      }

      this.expect(TokenKind.Arrow, "Expected '->'");
      const body = this.parseExpr();

      arms.push({
        pattern,
        guard,
        body,
        span: mergeSpans(armStart, body.span),
      });

      if (!this.check(TokenKind.RBrace)) {
        this.expect(TokenKind.Comma, "Expected ',' or '}'");
      }
    }

    this.expect(TokenKind.RBrace, "Expected '}'");

    return {
      kind: "match",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      scrutinee,
      arms,
    };
  }

  private parseBlock(): BlockExpr {
    const start = this.peek().span;
    this.expect(TokenKind.LBrace, "Expected '{'");

    const statements: Stmt[] = [];
    let expr: Expr | undefined;

    while (!this.check(TokenKind.RBrace) && !this.isAtEnd()) {
      // Check for trailing expression (no semicolon before })
      const stmt = this.parseStmt();

      // If it's an expression statement without a semicolon at the end,
      // it might be the block's value
      if (stmt.kind === "expr" && !this.match(TokenKind.Semicolon)) {
        if (this.check(TokenKind.RBrace)) {
          expr = stmt.expr;
          break;
        }
      }

      statements.push(stmt);
      this.match(TokenKind.Semicolon); // Optional semicolon
    }

    this.expect(TokenKind.RBrace, "Expected '}'");

    return {
      kind: "block",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      statements,
      expr,
    };
  }

  private parseArrayLiteral(start: SourceSpan): Expr {
    const elements: Expr[] = [];

    if (!this.check(TokenKind.RBracket)) {
      do {
        elements.push(this.parseExpr());
      } while (this.match(TokenKind.Comma));
    }

    this.expect(TokenKind.RBracket, "Expected ']'");

    return {
      kind: "array",
      id: generateNodeId(),
      span: mergeSpans(start, this.tokens[this.pos - 1].span),
      elements,
    };
  }

  private parseParenOrTuple(start: SourceSpan): Expr {
    // Check for unit: ()
    if (this.match(TokenKind.RParen)) {
      return { kind: "literal", id: generateNodeId(), span: mergeSpans(start, this.tokens[this.pos - 1].span), value: { kind: "unit" } };
    }

    const first = this.parseExpr();

    // Check for tuple: (a, b, ...)
    if (this.match(TokenKind.Comma)) {
      const elements: Expr[] = [first];
      do {
        elements.push(this.parseExpr());
      } while (this.match(TokenKind.Comma));
      this.expect(TokenKind.RParen, "Expected ')'");

      return {
        kind: "tuple",
        id: generateNodeId(),
        span: mergeSpans(start, this.tokens[this.pos - 1].span),
        elements,
      };
    }

    this.expect(TokenKind.RParen, "Expected ')'");
    // Just a parenthesized expression
    return first;
  }

  // ===========================================================================
  // Pattern Parsing
  // ===========================================================================

  private parsePattern(): Pattern {
    const tok = this.peek();

    // Wildcard
    if (this.match(TokenKind.Underscore)) {
      return { kind: "wildcard", id: generateNodeId(), span: tok.span };
    }

    // Literal patterns
    if (this.match(TokenKind.IntLit)) {
      return {
        kind: "literal",
        id: generateNodeId(),
        span: tok.span,
        value: {
          kind: "int",
          value: tok.value?.int?.value ?? 0n,
          suffix: tok.value?.int?.suffix ?? null,
        },
      };
    }
    if (this.match(TokenKind.StringLit)) {
      return {
        kind: "literal",
        id: generateNodeId(),
        span: tok.span,
        value: { kind: "string", value: tok.value?.string ?? "" },
      };
    }
    if (this.match(TokenKind.True)) {
      return { kind: "literal", id: generateNodeId(), span: tok.span, value: { kind: "bool", value: true } };
    }
    if (this.match(TokenKind.False)) {
      return { kind: "literal", id: generateNodeId(), span: tok.span, value: { kind: "bool", value: false } };
    }

    // Identifier pattern (binding)
    if (this.match(TokenKind.Ident)) {
      return { kind: "ident", id: generateNodeId(), span: tok.span, name: tok.value?.ident ?? "" };
    }

    // Variant pattern: Some(x) or None
    // Also accept built-in type keywords as variant names (e.g., Bool(_), String(s))
    const variantName = this.tryParseVariantName();
    if (variantName !== null) {
      if (this.match(TokenKind.LParen)) {
        const payload: Pattern[] = [];
        if (!this.check(TokenKind.RParen)) {
          do {
            payload.push(this.parsePattern());
          } while (this.match(TokenKind.Comma));
        }
        this.expect(TokenKind.RParen, "Expected ')'");

        return {
          kind: "variant",
          id: generateNodeId(),
          span: mergeSpans(tok.span, this.tokens[this.pos - 1].span),
          name: variantName,
          payload,
        };
      }

      return { kind: "variant", id: generateNodeId(), span: tok.span, name: variantName };
    }

    // Tuple pattern: (a, b)
    if (this.match(TokenKind.LParen)) {
      const elements: Pattern[] = [];
      if (!this.check(TokenKind.RParen)) {
        do {
          elements.push(this.parsePattern());
        } while (this.match(TokenKind.Comma));
      }
      this.expect(TokenKind.RParen, "Expected ')'");

      return {
        kind: "tuple",
        id: generateNodeId(),
        span: mergeSpans(tok.span, this.tokens[this.pos - 1].span),
        elements,
      };
    }

    // Record pattern: {name, age}
    if (this.match(TokenKind.LBrace)) {
      const fields: { name: string; pattern?: Pattern }[] = [];
      if (!this.check(TokenKind.RBrace)) {
        do {
          const fieldName = this.expect(TokenKind.Ident, "Expected field name");
          if (this.match(TokenKind.Colon)) {
            const pattern = this.parsePattern();
            fields.push({ name: fieldName.value?.ident ?? "", pattern });
          } else {
            fields.push({ name: fieldName.value?.ident ?? "" });
          }
        } while (this.match(TokenKind.Comma));
      }
      this.expect(TokenKind.RBrace, "Expected '}'");

      return {
        kind: "record",
        id: generateNodeId(),
        span: mergeSpans(tok.span, this.tokens[this.pos - 1].span),
        fields,
      };
    }

    throw this.error(`Expected pattern, got ${tok.kind}`);
  }
}

// =============================================================================
// Public API
// =============================================================================

export function parse(tokens: Token[]): { program: Program; errors: ParseError[] } {
  resetNodeIdCounter(); // Reset ID counter for deterministic IDs
  const parser = new Parser(tokens);
  const program = parser.parse();
  return { program, errors: parser.getErrors() };
}

/**
 * Parse a standalone expression from tokens.
 */
export function parseExpression(tokens: Token[]): { expr: Expr | undefined; errors: ParseError[] } {
  resetNodeIdCounter();
  const parser = new Parser(tokens);
  const expr = parser.parseExpressionPublic();
  return { expr, errors: parser.getErrors() };
}

/**
 * Parse a standalone type expression from tokens.
 */
export function parseTypeExpr(tokens: Token[]): { type: TypeExpr | undefined; errors: ParseError[] } {
  resetNodeIdCounter();
  const parser = new Parser(tokens);
  const type = parser.parseTypeExprPublic();
  return { type, errors: parser.getErrors() };
}

/**
 * Parse a standalone pattern from tokens.
 */
export function parsePattern(tokens: Token[]): { pattern: Pattern | undefined; errors: ParseError[] } {
  resetNodeIdCounter();
  const parser = new Parser(tokens);
  const pattern = parser.parsePatternPublic();
  return { pattern, errors: parser.getErrors() };
}
