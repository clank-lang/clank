/**
 * AST Deserialization
 *
 * Converts JSON AST to internal AST nodes.
 * Supports hybrid input: source strings are parsed inline.
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
  FnParam,
  LambdaParam,
} from "../parser/ast";
import type { SourceSpan } from "../utils/span";
import { tokenize } from "../lexer";
import { parse, parseExpression, parseTypeExpr as parseTypeExprStr, parsePattern as parsePatternStr } from "../parser";
import { SourceFile } from "../utils/source";
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
  SourceFragment,
} from "./schema";
import { isSourceFragment } from "./schema";

// =============================================================================
// Error Type
// =============================================================================

export interface DeserializeError {
  message: string;
  path: string; // JSON path where error occurred
}

export interface DeserializeResult<T> {
  ok: boolean;
  value: T | undefined;
  errors: DeserializeError[];
}

function errorResult<T>(errors: DeserializeError[]): DeserializeResult<T> {
  return { ok: false, value: undefined, errors };
}

function successResult<T>(value: T, errors: DeserializeError[] = []): DeserializeResult<T> {
  return { ok: errors.length === 0, value, errors };
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function deserializeProgram(json: string | JsonProgram): DeserializeResult<Program> {
  const errors: DeserializeError[] = [];

  try {
    const data: JsonProgram = typeof json === "string" ? JSON.parse(json) : json;

    if (data.kind !== "program") {
      return errorResult([{ message: `Expected kind "program", got "${data.kind}"`, path: "$" }]);
    }

    const declarations: Decl[] = [];
    for (let i = 0; i < data.declarations.length; i++) {
      const decl = data.declarations[i];
      const result = deserializeDecl(decl, `$.declarations[${i}]`);
      if (result.errors.length > 0) {
        errors.push(...result.errors);
      }
      if (result.value) {
        declarations.push(result.value);
      }
    }

    const program: Program = {
      kind: "program",
      declarations,
      span: data.span ? deserializeSpan(data.span) : syntheticSpan("ast-json"),
    };

    return { ok: errors.length === 0, value: program, errors };
  } catch (e) {
    return errorResult([{ message: `JSON parse error: ${e}`, path: "$" }]);
  }
}

// =============================================================================
// Declarations
// =============================================================================

function deserializeDecl(
  decl: JsonDecl | SourceFragment,
  path: string
): DeserializeResult<Decl> {
  if (isSourceFragment(decl)) {
    return parseSourceFragment(decl, path, "declaration");
  }

  const errors: DeserializeError[] = [];

  switch (decl.kind) {
    case "fn": {
      const body = deserializeBlockExpr(decl.body, `${path}.body`);
      errors.push(...body.errors);

      let precondition: Expr | undefined;
      if (decl.precondition) {
        const pre = deserializeExpr(decl.precondition, `${path}.precondition`);
        errors.push(...pre.errors);
        precondition = pre.value;
      }

      let postcondition: Expr | undefined;
      if (decl.postcondition) {
        const post = deserializeExpr(decl.postcondition, `${path}.postcondition`);
        errors.push(...post.errors);
        postcondition = post.value;
      }

      const returnType = deserializeTypeExprDirect(decl.returnType, `${path}.returnType`);

      const fnDecl: FnDecl = {
        kind: "fn",
        name: decl.name,
        typeParams: decl.typeParams?.map(deserializeTypeParam) ?? [],
        params: decl.params.map((p, i) => deserializeParam(p, `${path}.params[${i}]`)),
        returnType: returnType!,
        precondition,
        postcondition,
        body: body.value ?? syntheticBlock(),
        span: decl.span ? deserializeSpan(decl.span) : syntheticSpan("ast-json"),
      };

      return { ok: errors.length === 0, value: fnDecl, errors };
    }

    case "externalFn": {
      const extFn: ExternalFnDecl = {
        kind: "externalFn",
        name: decl.name,
        typeParams: decl.typeParams?.map(deserializeTypeParam) ?? [],
        params: decl.params.map((p, i) => deserializeParam(p, `${path}.params[${i}]`)),
        returnType: deserializeTypeExprDirect(decl.returnType, `${path}.returnType`)!,
        jsName: decl.jsName,
        span: decl.span ? deserializeSpan(decl.span) : syntheticSpan("ast-json"),
      };
      return { ok: true, value: extFn, errors: [] };
    }

    case "typeAlias": {
      const alias: TypeAliasDecl = {
        kind: "typeAlias",
        name: decl.name,
        typeParams: decl.typeParams?.map(deserializeTypeParam) ?? [],
        type: deserializeTypeExprDirect(decl.type, `${path}.type`)!,
        span: decl.span ? deserializeSpan(decl.span) : syntheticSpan("ast-json"),
      };
      return { ok: true, value: alias, errors: [] };
    }

    case "rec": {
      const rec: RecDecl = {
        kind: "rec",
        name: decl.name,
        typeParams: decl.typeParams?.map(deserializeTypeParam) ?? [],
        fields: decl.fields.map((f) => ({
          name: f.name,
          type: deserializeTypeExprDirect(f.type, `${path}.fields`)!,
          span: f.span ? deserializeSpan(f.span) : syntheticSpan("ast-json"),
        })),
        span: decl.span ? deserializeSpan(decl.span) : syntheticSpan("ast-json"),
      };
      return { ok: true, value: rec, errors: [] };
    }

    case "sum": {
      const sum: SumDecl = {
        kind: "sum",
        name: decl.name,
        typeParams: decl.typeParams?.map(deserializeTypeParam) ?? [],
        variants: decl.variants.map((v) => ({
          name: v.name,
          fields: v.fields?.map((f) => ({
            name: f.name,
            type: deserializeTypeExprDirect(f.type, `${path}.variants`)!,
          })),
          span: v.span ? deserializeSpan(v.span) : syntheticSpan("ast-json"),
        })),
        span: decl.span ? deserializeSpan(decl.span) : syntheticSpan("ast-json"),
      };
      return { ok: true, value: sum, errors: [] };
    }

    case "mod": {
      return {
        ok: true,
        value: {
          kind: "mod",
          name: decl.name,
          span: decl.span ? deserializeSpan(decl.span) : syntheticSpan("ast-json"),
        },
        errors: [],
      };
    }

    case "use":
      return {
        ok: true,
        value: {
          kind: "use",
          path: decl.path,
          items: decl.items,
          alias: decl.alias,
          isExternal: decl.isExternal ?? false,
          span: decl.span ? deserializeSpan(decl.span) : syntheticSpan("ast-json"),
        },
        errors: [],
      };

    default:
      return errorResult([{ message: `Unknown declaration kind: ${(decl as any).kind}`, path }]);
  }
}

function deserializeTypeParam(tp: { name: string; constraint?: JsonTypeExpr }) {
  return {
    name: tp.name,
    constraint: tp.constraint ? deserializeTypeExprDirect(tp.constraint, "") : undefined,
  };
}

function deserializeParam(p: { name: string; type: JsonTypeExpr; span?: JsonSpan }, path: string): FnParam {
  return {
    name: p.name,
    type: deserializeTypeExprDirect(p.type, path)!,
    span: p.span ? deserializeSpan(p.span) : syntheticSpan("ast-json"),
  };
}

function deserializeLambdaParam(p: { name: string; type?: JsonTypeExpr }): LambdaParam {
  return {
    name: p.name,
    type: p.type ? deserializeTypeExprDirect(p.type, "") : undefined,
  };
}

// =============================================================================
// Type Expressions
// =============================================================================

function deserializeTypeExpr(
  type: JsonTypeExpr | SourceFragment,
  path: string
): DeserializeResult<TypeExpr> {
  if (isSourceFragment(type)) {
    return parseSourceFragment(type, path, "type");
  }

  const result = deserializeTypeExprDirect(type, path);
  return { ok: !!result, value: result, errors: result ? [] : [{ message: "Failed to deserialize type", path }] };
}

function deserializeTypeExprDirect(
  type: JsonTypeExpr | SourceFragment,
  path: string
): TypeExpr | undefined {
  if (isSourceFragment(type)) {
    const result = parseSourceFragment<TypeExpr>(type, path, "type");
    return result.value;
  }

  const span = type.span ? deserializeSpan(type.span) : syntheticSpan("ast-json");

  switch (type.kind) {
    case "named":
      return {
        kind: "named",
        name: type.name,
        args: type.args?.map((a) => deserializeTypeExprDirect(a, path)!) ?? [],
        span,
      };

    case "array":
      return {
        kind: "array",
        element: deserializeTypeExprDirect(type.element, path)!,
        span,
      };

    case "tuple":
      return {
        kind: "tuple",
        elements: type.elements.map((e) => deserializeTypeExprDirect(e, path)!),
        span,
      };

    case "function":
      return {
        kind: "function",
        params: type.params.map((p) => deserializeTypeExprDirect(p, path)!),
        returnType: deserializeTypeExprDirect(type.returnType, path)!,
        span,
      };

    case "refined": {
      const predResult = deserializeExpr(type.predicate, `${path}.predicate`);
      return {
        kind: "refined",
        base: deserializeTypeExprDirect(type.base, path)!,
        varName: type.varName,
        predicate: predResult.value!,
        span,
      };
    }

    case "effect":
      return {
        kind: "effect",
        effects: type.effects.map((e) => deserializeTypeExprDirect(e, path)!),
        resultType: deserializeTypeExprDirect(type.resultType, path)!,
        span,
      };

    case "recordType":
      return {
        kind: "recordType",
        fields: type.fields.map((f) => ({
          name: f.name,
          type: deserializeTypeExprDirect(f.type, path)!,
        })),
        isOpen: type.isOpen ?? false,
        span,
      };

    default:
      return undefined;
  }
}

// =============================================================================
// Expressions
// =============================================================================

function deserializeExpr(
  expr: JsonExpr | SourceFragment,
  path: string
): DeserializeResult<Expr> {
  if (isSourceFragment(expr)) {
    return parseSourceFragment(expr, path, "expression");
  }

  const errors: DeserializeError[] = [];
  const span = expr.span ? deserializeSpan(expr.span) : syntheticSpan("ast-json");

  switch (expr.kind) {
    case "literal":
      return {
        ok: true,
        value: {
          kind: "literal",
          value: deserializeLiteralValue(expr.value),
          span,
        },
        errors: [],
      };

    case "ident":
      return {
        ok: true,
        value: { kind: "ident", name: expr.name, span },
        errors: [],
      };

    case "unary": {
      const operand = deserializeExpr(expr.operand, `${path}.operand`);
      errors.push(...operand.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "unary", op: expr.op, operand: operand.value!, span },
        errors,
      };
    }

    case "binary": {
      const left = deserializeExpr(expr.left, `${path}.left`);
      const right = deserializeExpr(expr.right, `${path}.right`);
      errors.push(...left.errors, ...right.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "binary", op: expr.op, left: left.value!, right: right.value!, span },
        errors,
      };
    }

    case "call": {
      const callee = deserializeExpr(expr.callee, `${path}.callee`);
      errors.push(...callee.errors);
      const args: Expr[] = [];
      for (let i = 0; i < expr.args.length; i++) {
        const arg = deserializeExpr(expr.args[i], `${path}.args[${i}]`);
        errors.push(...arg.errors);
        if (arg.value) args.push(arg.value);
      }
      return {
        ok: errors.length === 0,
        value: { kind: "call", callee: callee.value!, args, span },
        errors,
      };
    }

    case "index": {
      const object = deserializeExpr(expr.object, `${path}.object`);
      const index = deserializeExpr(expr.index, `${path}.index`);
      errors.push(...object.errors, ...index.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "index", object: object.value!, index: index.value!, span },
        errors,
      };
    }

    case "field": {
      const object = deserializeExpr(expr.object, `${path}.object`);
      errors.push(...object.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "field", object: object.value!, field: expr.field, span },
        errors,
      };
    }

    case "lambda": {
      const body = deserializeExpr(expr.body, `${path}.body`);
      errors.push(...body.errors);
      return {
        ok: errors.length === 0,
        value: {
          kind: "lambda",
          params: expr.params.map(deserializeLambdaParam),
          body: body.value!,
          span,
        },
        errors,
      };
    }

    case "if": {
      const condition = deserializeExpr(expr.condition, `${path}.condition`);
      const thenBranch = deserializeBlockExpr(expr.thenBranch, `${path}.thenBranch`);
      errors.push(...condition.errors, ...thenBranch.errors);

      let elseBranch: BlockExpr | Expr | undefined;
      if (expr.elseBranch) {
        if ("kind" in expr.elseBranch && expr.elseBranch.kind === "if") {
          const elseResult = deserializeExpr(expr.elseBranch, `${path}.elseBranch`);
          errors.push(...elseResult.errors);
          elseBranch = elseResult.value as Expr;
        } else {
          const elseResult = deserializeBlockExpr(expr.elseBranch as JsonBlockExpr | SourceFragment, `${path}.elseBranch`);
          errors.push(...elseResult.errors);
          elseBranch = elseResult.value;
        }
      }

      return {
        ok: errors.length === 0,
        value: {
          kind: "if",
          condition: condition.value!,
          thenBranch: thenBranch.value!,
          elseBranch,
          span,
        },
        errors,
      };
    }

    case "match": {
      const scrutinee = deserializeExpr(expr.scrutinee, `${path}.scrutinee`);
      errors.push(...scrutinee.errors);

      const arms: MatchArm[] = [];
      for (let i = 0; i < expr.arms.length; i++) {
        const arm = deserializeMatchArm(expr.arms[i], `${path}.arms[${i}]`);
        errors.push(...arm.errors);
        if (arm.value) arms.push(arm.value);
      }

      return {
        ok: errors.length === 0,
        value: { kind: "match", scrutinee: scrutinee.value!, arms, span },
        errors,
      };
    }

    case "block":
      return deserializeBlockExpr(expr, path);

    case "array": {
      const elements: Expr[] = [];
      for (let i = 0; i < expr.elements.length; i++) {
        const elem = deserializeExpr(expr.elements[i], `${path}.elements[${i}]`);
        errors.push(...elem.errors);
        if (elem.value) elements.push(elem.value);
      }
      return {
        ok: errors.length === 0,
        value: { kind: "array", elements, span },
        errors,
      };
    }

    case "tuple": {
      const elements: Expr[] = [];
      for (let i = 0; i < expr.elements.length; i++) {
        const elem = deserializeExpr(expr.elements[i], `${path}.elements[${i}]`);
        errors.push(...elem.errors);
        if (elem.value) elements.push(elem.value);
      }
      return {
        ok: errors.length === 0,
        value: { kind: "tuple", elements, span },
        errors,
      };
    }

    case "record": {
      const fields: { name: string; value: Expr }[] = [];
      for (let i = 0; i < expr.fields.length; i++) {
        const f = expr.fields[i];
        const value = deserializeExpr(f.value, `${path}.fields[${i}].value`);
        errors.push(...value.errors);
        if (value.value) fields.push({ name: f.name, value: value.value });
      }
      return {
        ok: errors.length === 0,
        value: { kind: "record", fields, span },
        errors,
      };
    }

    case "range": {
      const start = deserializeExpr(expr.start, `${path}.start`);
      const end = deserializeExpr(expr.end, `${path}.end`);
      errors.push(...start.errors, ...end.errors);
      return {
        ok: errors.length === 0,
        value: {
          kind: "range",
          start: start.value!,
          end: end.value!,
          inclusive: expr.inclusive ?? false,
          span,
        },
        errors,
      };
    }

    case "propagate": {
      const inner = deserializeExpr(expr.expr, `${path}.expr`);
      errors.push(...inner.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "propagate", expr: inner.value!, span },
        errors,
      };
    }

    default:
      return {
        ok: false,
        value: undefined,
        errors: [{ message: `Unknown expression kind: ${(expr as any).kind}`, path }],
      };
  }
}

function deserializeBlockExpr(
  block: JsonBlockExpr | SourceFragment,
  path: string
): DeserializeResult<BlockExpr> {
  if (isSourceFragment(block)) {
    return parseSourceFragment(block, path, "block");
  }

  const errors: DeserializeError[] = [];
  const span = block.span ? deserializeSpan(block.span) : syntheticSpan("ast-json");

  const statements: Stmt[] = [];
  for (let i = 0; i < block.statements.length; i++) {
    const stmt = deserializeStmt(block.statements[i], `${path}.statements[${i}]`);
    errors.push(...stmt.errors);
    if (stmt.value) statements.push(stmt.value);
  }

  let expr: Expr | undefined;
  if (block.expr) {
    const exprResult = deserializeExpr(block.expr, `${path}.expr`);
    errors.push(...exprResult.errors);
    expr = exprResult.value;
  }

  return {
    ok: errors.length === 0,
    value: { kind: "block", statements, expr, span },
    errors,
  };
}

function deserializeMatchArm(
  arm: JsonMatchArm,
  path: string
): DeserializeResult<MatchArm> {
  const errors: DeserializeError[] = [];
  const span = arm.span ? deserializeSpan(arm.span) : syntheticSpan("ast-json");

  const pattern = deserializePattern(arm.pattern, `${path}.pattern`);
  const body = deserializeExpr(arm.body, `${path}.body`);
  errors.push(...pattern.errors, ...body.errors);

  let guard: Expr | undefined;
  if (arm.guard) {
    const guardResult = deserializeExpr(arm.guard, `${path}.guard`);
    errors.push(...guardResult.errors);
    guard = guardResult.value;
  }

  return {
    ok: errors.length === 0,
    value: { pattern: pattern.value!, guard, body: body.value!, span },
    errors,
  };
}

type JsonLiteralValue =
  | { kind: "int"; value: string; suffix?: "i32" | "i64" | null }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string }
  | { kind: "template"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "unit" };

function deserializeLiteralValue(value: JsonLiteralValue): LiteralValue {
  switch (value.kind) {
    case "int":
      return {
        kind: "int",
        value: BigInt(value.value),
        suffix: value.suffix ?? null,
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

function deserializeStmt(
  stmt: JsonStmt | SourceFragment,
  path: string
): DeserializeResult<Stmt> {
  if (isSourceFragment(stmt)) {
    return parseSourceFragment(stmt, path, "statement");
  }

  const errors: DeserializeError[] = [];
  const span = stmt.span ? deserializeSpan(stmt.span) : syntheticSpan("ast-json");

  switch (stmt.kind) {
    case "expr": {
      const expr = deserializeExpr(stmt.expr, `${path}.expr`);
      errors.push(...expr.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "expr", expr: expr.value!, span },
        errors,
      };
    }

    case "let": {
      const pattern = deserializePattern(stmt.pattern, `${path}.pattern`);
      const init = deserializeExpr(stmt.init, `${path}.init`);
      errors.push(...pattern.errors, ...init.errors);
      return {
        ok: errors.length === 0,
        value: {
          kind: "let",
          pattern: pattern.value!,
          type: stmt.type ? deserializeTypeExprDirect(stmt.type, `${path}.type`) : undefined,
          mutable: stmt.mutable ?? false,
          init: init.value!,
          span,
        },
        errors,
      };
    }

    case "assign": {
      const target = deserializeExpr(stmt.target, `${path}.target`);
      const value = deserializeExpr(stmt.value, `${path}.value`);
      errors.push(...target.errors, ...value.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "assign", target: target.value!, value: value.value!, span },
        errors,
      };
    }

    case "for": {
      const pattern = deserializePattern(stmt.pattern, `${path}.pattern`);
      const iterable = deserializeExpr(stmt.iterable, `${path}.iterable`);
      const body = deserializeBlockExpr(stmt.body, `${path}.body`);
      errors.push(...pattern.errors, ...iterable.errors, ...body.errors);
      return {
        ok: errors.length === 0,
        value: {
          kind: "for",
          pattern: pattern.value!,
          iterable: iterable.value!,
          body: body.value!,
          span,
        },
        errors,
      };
    }

    case "while": {
      const condition = deserializeExpr(stmt.condition, `${path}.condition`);
      const body = deserializeBlockExpr(stmt.body, `${path}.body`);
      errors.push(...condition.errors, ...body.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "while", condition: condition.value!, body: body.value!, span },
        errors,
      };
    }

    case "loop": {
      const body = deserializeBlockExpr(stmt.body, `${path}.body`);
      errors.push(...body.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "loop", body: body.value!, span },
        errors,
      };
    }

    case "return": {
      let value: Expr | undefined;
      if (stmt.value) {
        const valueResult = deserializeExpr(stmt.value, `${path}.value`);
        errors.push(...valueResult.errors);
        value = valueResult.value;
      }
      return {
        ok: errors.length === 0,
        value: { kind: "return", value, span },
        errors,
      };
    }

    case "break":
      return { ok: true, value: { kind: "break", span }, errors: [] };

    case "continue":
      return { ok: true, value: { kind: "continue", span }, errors: [] };

    case "assert": {
      const condition = deserializeExpr(stmt.condition, `${path}.condition`);
      errors.push(...condition.errors);
      return {
        ok: errors.length === 0,
        value: { kind: "assert", condition: condition.value!, message: stmt.message, span },
        errors,
      };
    }

    default:
      return {
        ok: false,
        value: undefined,
        errors: [{ message: `Unknown statement kind: ${(stmt as any).kind}`, path }],
      };
  }
}

// =============================================================================
// Patterns
// =============================================================================

function deserializePattern(
  pattern: JsonPattern | SourceFragment,
  path: string
): DeserializeResult<Pattern> {
  if (isSourceFragment(pattern)) {
    return parseSourceFragment(pattern, path, "pattern");
  }

  const errors: DeserializeError[] = [];
  const span = pattern.span ? deserializeSpan(pattern.span) : syntheticSpan("ast-json");

  switch (pattern.kind) {
    case "wildcard":
      return { ok: true, value: { kind: "wildcard", span }, errors: [] };

    case "ident":
      return { ok: true, value: { kind: "ident", name: pattern.name, span }, errors: [] };

    case "literal":
      return {
        ok: true,
        value: { kind: "literal", value: deserializeLiteralValue(pattern.value), span },
        errors: [],
      };

    case "tuple": {
      const elements: Pattern[] = [];
      for (let i = 0; i < pattern.elements.length; i++) {
        const elem = deserializePattern(pattern.elements[i], `${path}.elements[${i}]`);
        errors.push(...elem.errors);
        if (elem.value) elements.push(elem.value);
      }
      return {
        ok: errors.length === 0,
        value: { kind: "tuple", elements, span },
        errors,
      };
    }

    case "record": {
      const fields: { name: string; pattern?: Pattern }[] = [];
      for (let i = 0; i < pattern.fields.length; i++) {
        const f = pattern.fields[i];
        let fieldPattern: Pattern | undefined;
        if (f.pattern) {
          const p = deserializePattern(f.pattern, `${path}.fields[${i}].pattern`);
          errors.push(...p.errors);
          fieldPattern = p.value;
        }
        fields.push({ name: f.name, pattern: fieldPattern });
      }
      return {
        ok: errors.length === 0,
        value: { kind: "record", fields, span },
        errors,
      };
    }

    case "variant": {
      let payload: Pattern[] | undefined;
      if (pattern.payload) {
        payload = [];
        for (let i = 0; i < pattern.payload.length; i++) {
          const p = deserializePattern(pattern.payload[i], `${path}.payload[${i}]`);
          errors.push(...p.errors);
          if (p.value) payload.push(p.value);
        }
      }
      return {
        ok: errors.length === 0,
        value: { kind: "variant", name: pattern.name, payload, span },
        errors,
      };
    }

    default:
      return {
        ok: false,
        value: undefined,
        errors: [{ message: `Unknown pattern kind: ${(pattern as any).kind}`, path }],
      };
  }
}

// =============================================================================
// Source Fragment Parsing
// =============================================================================

function parseSourceFragment<T>(
  fragment: SourceFragment,
  path: string,
  kind: "declaration" | "expression" | "type" | "pattern" | "statement" | "block"
): DeserializeResult<T> {
  const source = new SourceFile(fragment.file ?? "ast-json", fragment.source);
  const { tokens, errors: lexErrors } = tokenize(source);

  if (lexErrors.length > 0) {
    return {
      ok: false,
      errors: lexErrors.map((e) => ({
        message: `Lex error in source fragment: ${e.message}`,
        path,
      })),
    };
  }

  try {
    switch (kind) {
      case "declaration": {
        const { program, errors: parseErrors } = parse(tokens);
        if (parseErrors.length > 0) {
          return {
            ok: false,
            errors: parseErrors.map((e) => ({
              message: `Parse error in source fragment: ${e.message}`,
              path,
            })),
          };
        }
        if (program.declarations.length !== 1) {
          return {
            ok: false,
            errors: [{ message: `Expected exactly one declaration in source fragment`, path }],
          };
        }
        return { ok: true, value: program.declarations[0] as T, errors: [] };
      }

      case "expression": {
        const { expr, errors: parseErrors } = parseExpression(tokens);
        if (parseErrors.length > 0 || !expr) {
          return {
            ok: false,
            errors: parseErrors.map((e) => ({
              message: `Parse error in source fragment: ${e.message}`,
              path,
            })),
          };
        }
        return { ok: true, value: expr as T, errors: [] };
      }

      case "type": {
        const { type, errors: parseErrors } = parseTypeExprStr(tokens);
        if (parseErrors.length > 0 || !type) {
          return {
            ok: false,
            errors: parseErrors.map((e) => ({
              message: `Parse error in source fragment: ${e.message}`,
              path,
            })),
          };
        }
        return { ok: true, value: type as T, errors: [] };
      }

      case "pattern": {
        const { pattern, errors: parseErrors } = parsePatternStr(tokens);
        if (parseErrors.length > 0 || !pattern) {
          return {
            ok: false,
            errors: parseErrors.map((e) => ({
              message: `Parse error in source fragment: ${e.message}`,
              path,
            })),
          };
        }
        return { ok: true, value: pattern as T, errors: [] };
      }

      case "statement":
      case "block": {
        // Parse as expression wrapped in block
        const wrappedSource = new SourceFile(fragment.file ?? "ast-json", `{ ${fragment.source} }`);
        const { tokens: wTokens } = tokenize(wrappedSource);
        const { expr, errors: parseErrors } = parseExpression(wTokens);
        if (parseErrors.length > 0 || !expr || expr.kind !== "block") {
          return {
            ok: false,
            errors: parseErrors.map((e) => ({
              message: `Parse error in source fragment: ${e.message}`,
              path,
            })),
          };
        }
        if (kind === "block") {
          return { ok: true, value: expr as T, errors: [] };
        }
        // For statement, return first statement
        if (expr.statements.length !== 1) {
          return {
            ok: false,
            errors: [{ message: `Expected exactly one statement in source fragment`, path }],
          };
        }
        return { ok: true, value: expr.statements[0] as T, errors: [] };
      }
    }
  } catch (e) {
    return {
      ok: false,
      errors: [{ message: `Error parsing source fragment: ${e}`, path }],
    };
  }
}

// =============================================================================
// Helpers
// =============================================================================

function deserializeSpan(span: JsonSpan): SourceSpan {
  return {
    file: span.file ?? "ast-json",
    start: {
      line: span.start?.line ?? 1,
      column: span.start?.column ?? 1,
      offset: span.start?.offset ?? 0,
    },
    end: {
      line: span.end?.line ?? 1,
      column: span.end?.column ?? 1,
      offset: span.end?.offset ?? 0,
    },
  };
}

function syntheticSpan(file: string): SourceSpan {
  return {
    file,
    start: { line: 1, column: 1, offset: 0 },
    end: { line: 1, column: 1, offset: 0 },
  };
}

function syntheticBlock(): BlockExpr {
  return {
    kind: "block",
    statements: [],
    span: syntheticSpan("ast-json"),
  };
}
