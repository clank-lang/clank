/**
 * AST Serialization
 *
 * Converts internal AST nodes to JSON format.
 */

// @ts-nocheck - TODO: Fix strict type issues in this module

import type {
  Program,
  Decl,
  FnDecl,
  ExternalFnDecl,
  TypeAliasDecl,
  RecDecl,
  SumDecl,
  TypeExpr,
  Expr,
  Stmt,
  Pattern,
  BlockExpr,
  MatchArm,
  LiteralValue,
} from "../parser/ast";
import type { SourceSpan } from "../utils/span";
import type {
  JsonProgram,
  JsonDecl,
  JsonTypeExpr,
  JsonExpr,
  JsonStmt,
  JsonPattern,
  JsonBlockExpr,
  JsonMatchArm,
  JsonSpan,
  JsonParam,
  JsonTypeParam,
  JsonFieldDef,
  JsonVariantDef,
} from "./schema";

// =============================================================================
// Options
// =============================================================================

export interface SerializeOptions {
  /** Include source spans in output (default: true) */
  includeSpans?: boolean;
  /** Pretty-print JSON (default: false for compact output) */
  pretty?: boolean;
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function serializeProgram(
  program: Program,
  options: SerializeOptions = {}
): string {
  const { pretty = false } = options;
  const json = programToJson(program, options);
  return pretty ? JSON.stringify(json, null, 2) : JSON.stringify(json);
}

export function programToJson(
  program: Program,
  options: SerializeOptions = {}
): JsonProgram {
  const { includeSpans = true } = options;
  return {
    kind: "program",
    declarations: program.declarations.map((d) => declToJson(d, options)),
    ...(includeSpans && program.span ? { span: spanToJson(program.span) } : {}),
  };
}

// =============================================================================
// Declarations
// =============================================================================

function declToJson(decl: Decl, options: SerializeOptions): JsonDecl {
  const { includeSpans = true } = options;
  const span = includeSpans && decl.span ? { span: spanToJson(decl.span) } : {};

  switch (decl.kind) {
    case "fn":
      return fnDeclToJson(decl, options);

    case "externalFn":
      return {
        kind: "externalFn",
        name: decl.name,
        ...(decl.typeParams.length > 0
          ? { typeParams: decl.typeParams.map(typeParamToJson) }
          : {}),
        params: decl.params.map(paramToJson),
        returnType: typeExprToJson(decl.returnType, options),
        jsName: decl.jsName,
        ...span,
      };

    case "typeAlias":
      return {
        kind: "typeAlias",
        name: decl.name,
        ...(decl.typeParams.length > 0
          ? { typeParams: decl.typeParams.map(typeParamToJson) }
          : {}),
        type: typeExprToJson(decl.type, options),
        ...span,
      };

    case "rec":
      return {
        kind: "rec",
        name: decl.name,
        ...(decl.typeParams.length > 0
          ? { typeParams: decl.typeParams.map(typeParamToJson) }
          : {}),
        fields: decl.fields.map((f) => ({
          name: f.name,
          type: typeExprToJson(f.type, options),
        })),
        ...span,
      };

    case "sum":
      return {
        kind: "sum",
        name: decl.name,
        ...(decl.typeParams.length > 0
          ? { typeParams: decl.typeParams.map(typeParamToJson) }
          : {}),
        variants: decl.variants.map((v) => ({
          name: v.name,
          ...(v.fields && v.fields.length > 0
            ? {
                fields: v.fields.map((f) => ({
                  ...(f.name ? { name: f.name } : {}),
                  type: typeExprToJson(f.type, options),
                })),
              }
            : {}),
        })),
        ...span,
      };

    case "mod":
      return {
        kind: "mod",
        name: decl.name,
        ...span,
      };

    case "use":
      return {
        kind: "use",
        path: decl.path,
        ...(decl.items && decl.items.length > 0 ? { items: decl.items } : {}),
        ...(decl.alias ? { alias: decl.alias } : {}),
        ...(decl.isExternal ? { isExternal: true } : {}),
        ...span,
      };

    case "externalMod":
      // External modules are currently not fully implemented
      return {
        kind: "use",
        path: [decl.name],
        ...span,
      };
  }
}

function fnDeclToJson(decl: FnDecl, options: SerializeOptions): JsonDecl {
  const { includeSpans = true } = options;
  const span = includeSpans && decl.span ? { span: spanToJson(decl.span) } : {};

  return {
    kind: "fn",
    name: decl.name,
    ...(decl.typeParams.length > 0
      ? { typeParams: decl.typeParams.map(typeParamToJson) }
      : {}),
    params: decl.params.map(paramToJson),
    returnType: typeExprToJson(decl.returnType, options),
    ...(decl.precondition
      ? { precondition: exprToJson(decl.precondition, options) }
      : {}),
    ...(decl.postcondition
      ? { postcondition: exprToJson(decl.postcondition, options) }
      : {}),
    body: blockExprToJson(decl.body, options),
    ...span,
  };
}

function typeParamToJson(tp: { name: string; constraint?: TypeExpr }): JsonTypeParam {
  return {
    name: tp.name,
    ...(tp.constraint ? { constraint: typeExprToJson(tp.constraint, {}) } : {}),
  };
}

function paramToJson(p: { name: string; type: TypeExpr; span: SourceSpan }): JsonParam {
  return {
    name: p.name,
    type: typeExprToJson(p.type, {}),
  };
}

function lambdaParamToJson(p: { name: string; type?: TypeExpr }): { name: string; type?: JsonTypeExpr } {
  return {
    name: p.name,
    ...(p.type ? { type: typeExprToJson(p.type, {}) } : {}),
  };
}

// =============================================================================
// Type Expressions
// =============================================================================

function typeExprToJson(
  type: TypeExpr,
  options: SerializeOptions
): JsonTypeExpr {
  const { includeSpans = true } = options;
  const span = includeSpans && type.span ? { span: spanToJson(type.span) } : {};

  switch (type.kind) {
    case "named":
      return {
        kind: "named",
        name: type.name,
        ...(type.args.length > 0
          ? { args: type.args.map((a) => typeExprToJson(a, options)) }
          : {}),
        ...span,
      };

    case "array":
      return {
        kind: "array",
        element: typeExprToJson(type.element, options),
        ...span,
      };

    case "tuple":
      return {
        kind: "tuple",
        elements: type.elements.map((e) => typeExprToJson(e, options)),
        ...span,
      };

    case "function":
      return {
        kind: "function",
        params: type.params.map((p) => typeExprToJson(p, options)),
        returnType: typeExprToJson(type.returnType, options),
        ...span,
      };

    case "refined":
      return {
        kind: "refined",
        base: typeExprToJson(type.base, options),
        ...(type.varName ? { varName: type.varName } : {}),
        predicate: exprToJson(type.predicate, options),
        ...span,
      };

    case "effect":
      return {
        kind: "effect",
        effects: type.effects.map((e) => typeExprToJson(e, options)),
        resultType: typeExprToJson(type.resultType, options),
        ...span,
      };

    case "recordType":
      return {
        kind: "recordType",
        fields: type.fields.map((f) => ({
          name: f.name,
          type: typeExprToJson(f.type, options),
        })),
        ...(type.isOpen ? { isOpen: true } : {}),
        ...span,
      };
  }
}

// =============================================================================
// Expressions
// =============================================================================

function exprToJson(expr: Expr, options: SerializeOptions): JsonExpr {
  const { includeSpans = true } = options;
  const span = includeSpans && expr.span ? { span: spanToJson(expr.span) } : {};

  switch (expr.kind) {
    case "literal":
      return {
        kind: "literal",
        value: literalValueToJson(expr.value),
        ...span,
      };

    case "ident":
      return {
        kind: "ident",
        name: expr.name,
        ...span,
      };

    case "unary":
      return {
        kind: "unary",
        op: expr.op,
        operand: exprToJson(expr.operand, options),
        ...span,
      };

    case "binary":
      return {
        kind: "binary",
        op: expr.op,
        left: exprToJson(expr.left, options),
        right: exprToJson(expr.right, options),
        ...span,
      };

    case "call":
      return {
        kind: "call",
        callee: exprToJson(expr.callee, options),
        args: expr.args.map((a) => exprToJson(a, options)),
        ...span,
      };

    case "index":
      return {
        kind: "index",
        object: exprToJson(expr.object, options),
        index: exprToJson(expr.index, options),
        ...span,
      };

    case "field":
      return {
        kind: "field",
        object: exprToJson(expr.object, options),
        field: expr.field,
        ...span,
      };

    case "lambda":
      return {
        kind: "lambda",
        params: expr.params.map(lambdaParamToJson),
        body: exprToJson(expr.body, options),
        ...span,
      };

    case "if":
      return {
        kind: "if",
        condition: exprToJson(expr.condition, options),
        thenBranch: blockExprToJson(expr.thenBranch, options),
        ...(expr.elseBranch
          ? {
              elseBranch:
                expr.elseBranch.kind === "if"
                  ? exprToJson(expr.elseBranch, options)
                  : blockExprToJson(expr.elseBranch, options),
            }
          : {}),
        ...span,
      };

    case "match":
      return {
        kind: "match",
        scrutinee: exprToJson(expr.scrutinee, options),
        arms: expr.arms.map((a) => matchArmToJson(a, options)),
        ...span,
      };

    case "block":
      return blockExprToJson(expr, options);

    case "array":
      return {
        kind: "array",
        elements: expr.elements.map((e) => exprToJson(e, options)),
        ...span,
      };

    case "tuple":
      return {
        kind: "tuple",
        elements: expr.elements.map((e) => exprToJson(e, options)),
        ...span,
      };

    case "record":
      return {
        kind: "record",
        fields: expr.fields.map((f) => ({
          name: f.name,
          value: exprToJson(f.value, options),
        })),
        ...span,
      };

    case "range":
      return {
        kind: "range",
        start: exprToJson(expr.start, options),
        end: exprToJson(expr.end, options),
        ...(expr.inclusive ? { inclusive: true } : {}),
        ...span,
      };

    case "propagate":
      return {
        kind: "propagate",
        expr: exprToJson(expr.expr, options),
        ...span,
      };
  }
}

function blockExprToJson(
  block: BlockExpr,
  options: SerializeOptions
): JsonBlockExpr {
  const { includeSpans = true } = options;
  const span = includeSpans && block.span ? { span: spanToJson(block.span) } : {};

  return {
    kind: "block",
    statements: block.statements.map((s) => stmtToJson(s, options)),
    ...(block.expr ? { expr: exprToJson(block.expr, options) } : {}),
    ...span,
  };
}

function matchArmToJson(arm: MatchArm, options: SerializeOptions): JsonMatchArm {
  const { includeSpans = true } = options;
  const span = includeSpans && arm.span ? { span: spanToJson(arm.span) } : {};

  return {
    pattern: patternToJson(arm.pattern, options),
    ...(arm.guard ? { guard: exprToJson(arm.guard, options) } : {}),
    body: exprToJson(arm.body, options),
    ...span,
  };
}

type JsonLiteralValue =
  | { kind: "int"; value: string; suffix?: "i32" | "i64" | null }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string }
  | { kind: "template"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "unit" };

function literalValueToJson(value: LiteralValue): JsonLiteralValue {
  switch (value.kind) {
    case "int":
      return {
        kind: "int",
        value: value.value.toString(),
        ...(value.suffix ? { suffix: value.suffix } : {}),
      };
    case "float":
      return { kind: "float", value: value.value };
    case "string":
      return { kind: "string", value: value.value };
    case "template":
      return { kind: "template", value: value.value };
    case "bool":
      return { kind: "bool", value: value.value };
    case "unit":
      return { kind: "unit" };
  }
}

// =============================================================================
// Statements
// =============================================================================

function stmtToJson(stmt: Stmt, options: SerializeOptions): JsonStmt {
  const { includeSpans = true } = options;
  const span = includeSpans && stmt.span ? { span: spanToJson(stmt.span) } : {};

  switch (stmt.kind) {
    case "expr":
      return {
        kind: "expr",
        expr: exprToJson(stmt.expr, options),
        ...span,
      };

    case "let":
      return {
        kind: "let",
        pattern: patternToJson(stmt.pattern, options),
        ...(stmt.type ? { type: typeExprToJson(stmt.type, options) } : {}),
        ...(stmt.mutable ? { mutable: true } : {}),
        init: exprToJson(stmt.init, options),
        ...span,
      };

    case "assign":
      return {
        kind: "assign",
        target: exprToJson(stmt.target, options),
        value: exprToJson(stmt.value, options),
        ...span,
      };

    case "for":
      return {
        kind: "for",
        pattern: patternToJson(stmt.pattern, options),
        iterable: exprToJson(stmt.iterable, options),
        body: blockExprToJson(stmt.body, options),
        ...span,
      };

    case "while":
      return {
        kind: "while",
        condition: exprToJson(stmt.condition, options),
        body: blockExprToJson(stmt.body, options),
        ...span,
      };

    case "loop":
      return {
        kind: "loop",
        body: blockExprToJson(stmt.body, options),
        ...span,
      };

    case "return":
      return {
        kind: "return",
        ...(stmt.value ? { value: exprToJson(stmt.value, options) } : {}),
        ...span,
      };

    case "break":
      return { kind: "break", ...span };

    case "continue":
      return { kind: "continue", ...span };

    case "assert":
      return {
        kind: "assert",
        condition: exprToJson(stmt.condition, options),
        ...(stmt.message ? { message: stmt.message } : {}),
        ...span,
      };
  }
}

// =============================================================================
// Patterns
// =============================================================================

function patternToJson(pattern: Pattern, options: SerializeOptions): JsonPattern {
  const { includeSpans = true } = options;
  const span = includeSpans && pattern.span ? { span: spanToJson(pattern.span) } : {};

  switch (pattern.kind) {
    case "wildcard":
      return { kind: "wildcard", ...span };

    case "ident":
      return { kind: "ident", name: pattern.name, ...span };

    case "literal":
      return {
        kind: "literal",
        value: literalValueToJson(pattern.value),
        ...span,
      };

    case "tuple":
      return {
        kind: "tuple",
        elements: pattern.elements.map((e) => patternToJson(e, options)),
        ...span,
      };

    case "record":
      return {
        kind: "record",
        fields: pattern.fields.map((f) => ({
          name: f.name,
          ...(f.pattern ? { pattern: patternToJson(f.pattern, options) } : {}),
        })),
        ...span,
      };

    case "variant":
      return {
        kind: "variant",
        name: pattern.name,
        ...(pattern.payload
          ? { payload: pattern.payload.map((p) => patternToJson(p, options)) }
          : {}),
        ...span,
      };
  }
}

// =============================================================================
// Spans
// =============================================================================

function spanToJson(span: SourceSpan): JsonSpan {
  return {
    file: span.file,
    start: {
      line: span.start.line,
      column: span.start.column,
      offset: span.start.offset,
    },
    end: {
      line: span.end.line,
      column: span.end.column,
      offset: span.end.offset,
    },
  };
}
