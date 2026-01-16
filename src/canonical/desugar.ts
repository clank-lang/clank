/**
 * AST Desugaring
 *
 * Transforms syntactic sugar into canonical forms:
 * 1. Unicode operators → ASCII equivalents
 * 2. Pipe operator (|>) → function call
 * 3. Range expressions → range function calls
 * 4. Negation operator (¬) → !
 */

import type {
  Program,
  Decl,
  Stmt,
  Expr,
  BinaryOp,
  UnaryOp,
  BlockExpr,
  IfExpr,
  MatchExpr,
  FnDecl,
} from "../parser/ast";
import { generateNodeId } from "../parser/ast";

// =============================================================================
// Unicode to ASCII Mapping
// =============================================================================

const UNICODE_BINARY_OPS: Record<string, BinaryOp> = {
  "≠": "!=",
  "≤": "<=",
  "≥": ">=",
  "∧": "&&",
  "∨": "||",
};

const UNICODE_UNARY_OPS: Record<string, UnaryOp> = {
  "¬": "!",
};

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Desugar a program, converting syntactic sugar to canonical forms.
 */
export function desugar(program: Program): Program {
  return {
    ...program,
    declarations: program.declarations.map(desugarDecl),
  };
}

// =============================================================================
// Declaration Desugaring
// =============================================================================

function desugarDecl(decl: Decl): Decl {
  switch (decl.kind) {
    case "fn":
      return desugarFnDecl(decl);
    case "externalFn":
      // External functions don't have bodies to desugar
      return decl;
    case "typeAlias":
    case "rec":
    case "sum":
    case "mod":
    case "use":
    case "externalMod":
      // These don't contain expressions
      return decl;
  }
}

function desugarFnDecl(decl: FnDecl): FnDecl {
  return {
    ...decl,
    precondition: decl.precondition ? desugarExpr(decl.precondition) : undefined,
    postcondition: decl.postcondition ? desugarExpr(decl.postcondition) : undefined,
    body: desugarBlockExpr(decl.body),
  };
}

// =============================================================================
// Statement Desugaring
// =============================================================================

function desugarStmt(stmt: Stmt): Stmt {
  switch (stmt.kind) {
    case "expr":
      return { ...stmt, expr: desugarExpr(stmt.expr) };

    case "let":
      return { ...stmt, init: desugarExpr(stmt.init) };

    case "assign":
      return {
        ...stmt,
        target: desugarExpr(stmt.target),
        value: desugarExpr(stmt.value),
      };

    case "for":
      return {
        ...stmt,
        iterable: desugarExpr(stmt.iterable),
        body: desugarBlockExpr(stmt.body),
      };

    case "while":
      return {
        ...stmt,
        condition: desugarExpr(stmt.condition),
        body: desugarBlockExpr(stmt.body),
      };

    case "loop":
      return { ...stmt, body: desugarBlockExpr(stmt.body) };

    case "return":
      return { ...stmt, value: stmt.value ? desugarExpr(stmt.value) : undefined };

    case "break":
    case "continue":
      return stmt;

    case "assert":
      return { ...stmt, condition: desugarExpr(stmt.condition) };
  }
}

// =============================================================================
// Expression Desugaring
// =============================================================================

function desugarExpr(expr: Expr): Expr {
  switch (expr.kind) {
    case "literal":
    case "ident":
      return expr;

    case "unary":
      return desugarUnaryExpr(expr);

    case "binary":
      return desugarBinaryExpr(expr);

    case "call":
      return {
        ...expr,
        callee: desugarExpr(expr.callee),
        args: expr.args.map(desugarExpr),
      };

    case "index":
      return {
        ...expr,
        object: desugarExpr(expr.object),
        index: desugarExpr(expr.index),
      };

    case "field":
      return { ...expr, object: desugarExpr(expr.object) };

    case "lambda":
      return { ...expr, body: desugarExpr(expr.body) };

    case "if":
      return desugarIfExpr(expr);

    case "match":
      return desugarMatchExpr(expr);

    case "block":
      return desugarBlockExpr(expr);

    case "array":
      return { ...expr, elements: expr.elements.map(desugarExpr) };

    case "tuple":
      return { ...expr, elements: expr.elements.map(desugarExpr) };

    case "record":
      return {
        ...expr,
        fields: expr.fields.map((f) => ({ ...f, value: desugarExpr(f.value) })),
      };

    case "range":
      return desugarRangeExpr(expr);

    case "propagate":
      return { ...expr, expr: desugarExpr(expr.expr) };
  }
}

function desugarUnaryExpr(expr: Extract<Expr, { kind: "unary" }>): Expr {
  const operand = desugarExpr(expr.operand);

  // Convert Unicode unary operators to ASCII
  const op = UNICODE_UNARY_OPS[expr.op] ?? expr.op;

  return { ...expr, op, operand };
}

function desugarBinaryExpr(expr: Extract<Expr, { kind: "binary" }>): Expr {
  const left = desugarExpr(expr.left);
  const right = desugarExpr(expr.right);

  // Handle pipe operator: x |> f => f(x)
  if (expr.op === "|>") {
    return {
      kind: "call",
      id: expr.id,
      span: expr.span,
      callee: right,
      args: [left],
    };
  }

  // Convert Unicode binary operators to ASCII
  const op = UNICODE_BINARY_OPS[expr.op] ?? expr.op;

  return { ...expr, op, left, right };
}

function desugarRangeExpr(expr: Extract<Expr, { kind: "range" }>): Expr {
  const start = desugarExpr(expr.start);
  const end = desugarExpr(expr.end);

  // Convert range to function call: start..end => __range(start, end, false)
  // start..=end => __range(start, end, true)
  return {
    kind: "call",
    id: expr.id,
    span: expr.span,
    callee: {
      kind: "ident",
      id: generateNodeId(),
      span: expr.span,
      name: "__range",
    },
    args: [
      start,
      end,
      {
        kind: "literal",
        id: generateNodeId(),
        span: expr.span,
        value: { kind: "bool", value: expr.inclusive },
      },
    ],
  };
}

function desugarIfExpr(expr: IfExpr): Expr {
  return {
    ...expr,
    condition: desugarExpr(expr.condition),
    thenBranch: desugarBlockExpr(expr.thenBranch),
    elseBranch: expr.elseBranch
      ? expr.elseBranch.kind === "if"
        ? (desugarIfExpr(expr.elseBranch) as IfExpr)
        : desugarBlockExpr(expr.elseBranch)
      : undefined,
  };
}

function desugarMatchExpr(expr: MatchExpr): MatchExpr {
  return {
    ...expr,
    scrutinee: desugarExpr(expr.scrutinee),
    arms: expr.arms.map((arm) => ({
      ...arm,
      guard: arm.guard ? desugarExpr(arm.guard) : undefined,
      body: desugarExpr(arm.body),
    })),
  };
}

function desugarBlockExpr(block: BlockExpr): BlockExpr {
  return {
    ...block,
    statements: block.statements.map(desugarStmt),
    expr: block.expr ? desugarExpr(block.expr) : undefined,
  };
}
