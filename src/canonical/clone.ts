/**
 * AST Cloning
 *
 * Deep clones AST nodes to avoid mutating the original AST during
 * canonical transformations.
 */

import type {
  Program,
  Decl,
  Stmt,
  Expr,
  Pattern,
  TypeExpr,
  BlockExpr,
  MatchArm,
  LiteralValue,
  FnParam,
  TypeParam,
  RecField,
  SumVariant,
  SumVariantField,
} from "../parser/ast";
import { generateNodeId } from "../parser/ast";
import type { SourceSpan } from "../utils/span";

// =============================================================================
// Span Cloning
// =============================================================================

function cloneSpan(span: SourceSpan): SourceSpan {
  return {
    file: span.file,
    start: { ...span.start },
    end: { ...span.end },
  };
}

// =============================================================================
// Literal Cloning
// =============================================================================

function cloneLiteralValue(value: LiteralValue): LiteralValue {
  switch (value.kind) {
    case "int":
      return { kind: "int", value: value.value, suffix: value.suffix };
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
// Pattern Cloning
// =============================================================================

export function clonePattern(pattern: Pattern): Pattern {
  const id = generateNodeId();
  const span = cloneSpan(pattern.span);

  switch (pattern.kind) {
    case "wildcard":
      return { kind: "wildcard", id, span };

    case "ident":
      return { kind: "ident", id, span, name: pattern.name };

    case "literal":
      return { kind: "literal", id, span, value: cloneLiteralValue(pattern.value) };

    case "tuple":
      return {
        kind: "tuple",
        id,
        span,
        elements: pattern.elements.map(clonePattern),
      };

    case "record":
      return {
        kind: "record",
        id,
        span,
        fields: pattern.fields.map((f) => ({
          name: f.name,
          pattern: f.pattern ? clonePattern(f.pattern) : undefined,
        })),
      };

    case "variant":
      return {
        kind: "variant",
        id,
        span,
        name: pattern.name,
        payload: pattern.payload ? pattern.payload.map(clonePattern) : undefined,
      };
  }
}

// =============================================================================
// Type Expression Cloning
// =============================================================================

export function cloneTypeExpr(type: TypeExpr): TypeExpr {
  const id = generateNodeId();
  const span = cloneSpan(type.span);

  switch (type.kind) {
    case "named":
      return {
        kind: "named",
        id,
        span,
        name: type.name,
        args: type.args.map(cloneTypeExpr),
      };

    case "array":
      return {
        kind: "array",
        id,
        span,
        element: cloneTypeExpr(type.element),
      };

    case "tuple":
      return {
        kind: "tuple",
        id,
        span,
        elements: type.elements.map(cloneTypeExpr),
      };

    case "function":
      return {
        kind: "function",
        id,
        span,
        params: type.params.map(cloneTypeExpr),
        returnType: cloneTypeExpr(type.returnType),
      };

    case "refined":
      return {
        kind: "refined",
        id,
        span,
        base: cloneTypeExpr(type.base),
        varName: type.varName,
        predicate: cloneExpr(type.predicate),
      };

    case "effect":
      return {
        kind: "effect",
        id,
        span,
        effects: type.effects.map(cloneTypeExpr),
        resultType: cloneTypeExpr(type.resultType),
      };

    case "recordType":
      return {
        kind: "recordType",
        id,
        span,
        fields: type.fields.map((f) => ({
          name: f.name,
          type: cloneTypeExpr(f.type),
        })),
        isOpen: type.isOpen,
      };
  }
}

// =============================================================================
// Expression Cloning
// =============================================================================

export function cloneExpr(expr: Expr): Expr {
  const id = generateNodeId();
  const span = cloneSpan(expr.span);

  switch (expr.kind) {
    case "literal":
      return { kind: "literal", id, span, value: cloneLiteralValue(expr.value) };

    case "ident":
      return { kind: "ident", id, span, name: expr.name };

    case "unary":
      return {
        kind: "unary",
        id,
        span,
        op: expr.op,
        operand: cloneExpr(expr.operand),
      };

    case "binary":
      return {
        kind: "binary",
        id,
        span,
        op: expr.op,
        left: cloneExpr(expr.left),
        right: cloneExpr(expr.right),
      };

    case "call":
      return {
        kind: "call",
        id,
        span,
        callee: cloneExpr(expr.callee),
        args: expr.args.map(cloneExpr),
      };

    case "index":
      return {
        kind: "index",
        id,
        span,
        object: cloneExpr(expr.object),
        index: cloneExpr(expr.index),
      };

    case "field":
      return {
        kind: "field",
        id,
        span,
        object: cloneExpr(expr.object),
        field: expr.field,
      };

    case "lambda":
      return {
        kind: "lambda",
        id,
        span,
        params: expr.params.map((p) => ({
          name: p.name,
          type: p.type ? cloneTypeExpr(p.type) : undefined,
        })),
        body: cloneExpr(expr.body),
      };

    case "if":
      return {
        kind: "if",
        id,
        span,
        condition: cloneExpr(expr.condition),
        thenBranch: cloneBlockExpr(expr.thenBranch),
        elseBranch: expr.elseBranch
          ? expr.elseBranch.kind === "if"
            ? (cloneExpr(expr.elseBranch) as typeof expr.elseBranch)
            : cloneBlockExpr(expr.elseBranch)
          : undefined,
      };

    case "match":
      return {
        kind: "match",
        id,
        span,
        scrutinee: cloneExpr(expr.scrutinee),
        arms: expr.arms.map(cloneMatchArm),
      };

    case "block":
      return cloneBlockExpr(expr);

    case "array":
      return {
        kind: "array",
        id,
        span,
        elements: expr.elements.map(cloneExpr),
      };

    case "tuple":
      return {
        kind: "tuple",
        id,
        span,
        elements: expr.elements.map(cloneExpr),
      };

    case "record":
      return {
        kind: "record",
        id,
        span,
        fields: expr.fields.map((f) => ({
          name: f.name,
          value: cloneExpr(f.value),
        })),
      };

    case "range":
      return {
        kind: "range",
        id,
        span,
        start: cloneExpr(expr.start),
        end: cloneExpr(expr.end),
        inclusive: expr.inclusive,
      };

    case "propagate":
      return {
        kind: "propagate",
        id,
        span,
        expr: cloneExpr(expr.expr),
      };
  }
}

export function cloneBlockExpr(block: BlockExpr): BlockExpr {
  return {
    kind: "block",
    id: generateNodeId(),
    span: cloneSpan(block.span),
    statements: block.statements.map(cloneStmt),
    expr: block.expr ? cloneExpr(block.expr) : undefined,
  };
}

function cloneMatchArm(arm: MatchArm): MatchArm {
  return {
    pattern: clonePattern(arm.pattern),
    guard: arm.guard ? cloneExpr(arm.guard) : undefined,
    body: cloneExpr(arm.body),
    span: cloneSpan(arm.span),
  };
}

// =============================================================================
// Statement Cloning
// =============================================================================

export function cloneStmt(stmt: Stmt): Stmt {
  const id = generateNodeId();
  const span = cloneSpan(stmt.span);

  switch (stmt.kind) {
    case "expr":
      return { kind: "expr", id, span, expr: cloneExpr(stmt.expr) };

    case "let":
      return {
        kind: "let",
        id,
        span,
        pattern: clonePattern(stmt.pattern),
        mutable: stmt.mutable,
        type: stmt.type ? cloneTypeExpr(stmt.type) : undefined,
        init: cloneExpr(stmt.init),
      };

    case "assign":
      return {
        kind: "assign",
        id,
        span,
        target: cloneExpr(stmt.target),
        value: cloneExpr(stmt.value),
      };

    case "for":
      return {
        kind: "for",
        id,
        span,
        pattern: clonePattern(stmt.pattern),
        iterable: cloneExpr(stmt.iterable),
        body: cloneBlockExpr(stmt.body),
      };

    case "while":
      return {
        kind: "while",
        id,
        span,
        condition: cloneExpr(stmt.condition),
        body: cloneBlockExpr(stmt.body),
      };

    case "loop":
      return {
        kind: "loop",
        id,
        span,
        body: cloneBlockExpr(stmt.body),
      };

    case "return":
      return {
        kind: "return",
        id,
        span,
        value: stmt.value ? cloneExpr(stmt.value) : undefined,
      };

    case "break":
      return { kind: "break", id, span };

    case "continue":
      return { kind: "continue", id, span };

    case "assert":
      return {
        kind: "assert",
        id,
        span,
        condition: cloneExpr(stmt.condition),
        message: stmt.message,
      };
  }
}

// =============================================================================
// Declaration Cloning
// =============================================================================

function cloneTypeParam(tp: TypeParam): TypeParam {
  return {
    name: tp.name,
    constraint: tp.constraint ? cloneTypeExpr(tp.constraint) : undefined,
  };
}

function cloneFnParam(p: FnParam): FnParam {
  return {
    name: p.name,
    type: cloneTypeExpr(p.type),
    span: cloneSpan(p.span),
  };
}

function cloneRecField(f: RecField): RecField {
  return {
    name: f.name,
    type: cloneTypeExpr(f.type),
    span: cloneSpan(f.span),
  };
}

function cloneSumVariantField(f: SumVariantField): SumVariantField {
  return {
    name: f.name,
    type: cloneTypeExpr(f.type),
  };
}

function cloneSumVariant(v: SumVariant): SumVariant {
  return {
    name: v.name,
    fields: v.fields ? v.fields.map(cloneSumVariantField) : undefined,
    span: cloneSpan(v.span),
  };
}

export function cloneDecl(decl: Decl): Decl {
  const id = generateNodeId();
  const span = cloneSpan(decl.span);

  switch (decl.kind) {
    case "fn":
      return {
        kind: "fn",
        id,
        span,
        name: decl.name,
        typeParams: decl.typeParams.map(cloneTypeParam),
        params: decl.params.map(cloneFnParam),
        returnType: cloneTypeExpr(decl.returnType),
        precondition: decl.precondition ? cloneExpr(decl.precondition) : undefined,
        postcondition: decl.postcondition ? cloneExpr(decl.postcondition) : undefined,
        body: cloneBlockExpr(decl.body),
      };

    case "externalFn":
      return {
        kind: "externalFn",
        id,
        span,
        name: decl.name,
        typeParams: decl.typeParams.map(cloneTypeParam),
        params: decl.params.map(cloneFnParam),
        returnType: cloneTypeExpr(decl.returnType),
        jsName: decl.jsName,
      };

    case "typeAlias":
      return {
        kind: "typeAlias",
        id,
        span,
        name: decl.name,
        typeParams: decl.typeParams.map(cloneTypeParam),
        type: cloneTypeExpr(decl.type),
      };

    case "rec":
      return {
        kind: "rec",
        id,
        span,
        name: decl.name,
        typeParams: decl.typeParams.map(cloneTypeParam),
        fields: decl.fields.map(cloneRecField),
      };

    case "sum":
      return {
        kind: "sum",
        id,
        span,
        name: decl.name,
        typeParams: decl.typeParams.map(cloneTypeParam),
        variants: decl.variants.map(cloneSumVariant),
      };

    case "mod":
      return {
        kind: "mod",
        id,
        span,
        name: decl.name,
      };

    case "use":
      return {
        kind: "use",
        id,
        span,
        path: [...decl.path],
        items: decl.items ? [...decl.items] : undefined,
        alias: decl.alias,
        isExternal: decl.isExternal,
      };

    case "externalMod":
      return {
        kind: "externalMod",
        id,
        span,
        name: decl.name,
        jsModule: decl.jsModule,
        functions: decl.functions.map((f) => cloneDecl(f) as typeof f),
      };
  }
}

// =============================================================================
// Program Cloning
// =============================================================================

export function cloneProgram(program: Program): Program {
  return {
    kind: "program",
    id: generateNodeId(),
    span: cloneSpan(program.span),
    declarations: program.declarations.map(cloneDecl),
  };
}
