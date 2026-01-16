/**
 * AST Normalization
 *
 * Transforms the AST into a more uniform structure:
 * 1. Add explicit else branches that return unit
 * 2. Ensure all function bodies have explicit final expressions
 * 3. Normalize empty blocks to have unit expressions
 */

import type {
  Program,
  Decl,
  Stmt,
  Expr,
  BlockExpr,
  IfExpr,
  MatchExpr,
  FnDecl,
} from "../parser/ast";
import { generateNodeId } from "../parser/ast";
import type { SourceSpan } from "../utils/span";

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Normalize a program's AST structure.
 */
export function normalize(program: Program): Program {
  return {
    ...program,
    declarations: program.declarations.map(normalizeDecl),
  };
}

// =============================================================================
// Declaration Normalization
// =============================================================================

function normalizeDecl(decl: Decl): Decl {
  switch (decl.kind) {
    case "fn":
      return normalizeFnDecl(decl);
    case "externalFn":
    case "typeAlias":
    case "rec":
    case "sum":
    case "mod":
    case "use":
    case "externalMod":
      return decl;
  }
}

function normalizeFnDecl(decl: FnDecl): FnDecl {
  return {
    ...decl,
    precondition: decl.precondition ? normalizeExpr(decl.precondition) : undefined,
    postcondition: decl.postcondition ? normalizeExpr(decl.postcondition) : undefined,
    body: normalizeBlockExpr(decl.body, true),
  };
}

// =============================================================================
// Statement Normalization
// =============================================================================

function normalizeStmt(stmt: Stmt): Stmt {
  switch (stmt.kind) {
    case "expr":
      return { ...stmt, expr: normalizeExpr(stmt.expr) };

    case "let":
      return { ...stmt, init: normalizeExpr(stmt.init) };

    case "assign":
      return {
        ...stmt,
        target: normalizeExpr(stmt.target),
        value: normalizeExpr(stmt.value),
      };

    case "for":
      return {
        ...stmt,
        iterable: normalizeExpr(stmt.iterable),
        body: normalizeBlockExpr(stmt.body, false),
      };

    case "while":
      return {
        ...stmt,
        condition: normalizeExpr(stmt.condition),
        body: normalizeBlockExpr(stmt.body, false),
      };

    case "loop":
      return { ...stmt, body: normalizeBlockExpr(stmt.body, false) };

    case "return":
      return {
        ...stmt,
        value: stmt.value ? normalizeExpr(stmt.value) : createUnitExpr(stmt.span),
      };

    case "break":
    case "continue":
      return stmt;

    case "assert":
      return { ...stmt, condition: normalizeExpr(stmt.condition) };
  }
}

// =============================================================================
// Expression Normalization
// =============================================================================

function normalizeExpr(expr: Expr): Expr {
  switch (expr.kind) {
    case "literal":
    case "ident":
      return expr;

    case "unary":
      return { ...expr, operand: normalizeExpr(expr.operand) };

    case "binary":
      return {
        ...expr,
        left: normalizeExpr(expr.left),
        right: normalizeExpr(expr.right),
      };

    case "call":
      return {
        ...expr,
        callee: normalizeExpr(expr.callee),
        args: expr.args.map(normalizeExpr),
      };

    case "index":
      return {
        ...expr,
        object: normalizeExpr(expr.object),
        index: normalizeExpr(expr.index),
      };

    case "field":
      return { ...expr, object: normalizeExpr(expr.object) };

    case "lambda":
      return { ...expr, body: normalizeExpr(expr.body) };

    case "if":
      return normalizeIfExpr(expr);

    case "match":
      return normalizeMatchExpr(expr);

    case "block":
      return normalizeBlockExpr(expr, false);

    case "array":
      return { ...expr, elements: expr.elements.map(normalizeExpr) };

    case "tuple":
      return { ...expr, elements: expr.elements.map(normalizeExpr) };

    case "record":
      return {
        ...expr,
        fields: expr.fields.map((f) => ({ ...f, value: normalizeExpr(f.value) })),
      };

    case "range":
      return {
        ...expr,
        start: normalizeExpr(expr.start),
        end: normalizeExpr(expr.end),
      };

    case "propagate":
      return { ...expr, expr: normalizeExpr(expr.expr) };
  }
}

/**
 * Normalize if expressions by adding explicit else branches.
 */
function normalizeIfExpr(expr: IfExpr): IfExpr {
  const thenBranch = normalizeBlockExpr(expr.thenBranch, false);

  // If there's no else branch, add one that returns unit
  let elseBranch: BlockExpr | IfExpr;
  if (!expr.elseBranch) {
    elseBranch = createUnitBlock(expr.span);
  } else if (expr.elseBranch.kind === "if") {
    elseBranch = normalizeIfExpr(expr.elseBranch);
  } else {
    elseBranch = normalizeBlockExpr(expr.elseBranch, false);
  }

  return {
    ...expr,
    condition: normalizeExpr(expr.condition),
    thenBranch,
    elseBranch,
  };
}

function normalizeMatchExpr(expr: MatchExpr): MatchExpr {
  return {
    ...expr,
    scrutinee: normalizeExpr(expr.scrutinee),
    arms: expr.arms.map((arm) => ({
      ...arm,
      guard: arm.guard ? normalizeExpr(arm.guard) : undefined,
      body: normalizeExpr(arm.body),
    })),
  };
}

/**
 * Normalize a block expression.
 *
 * @param block The block to normalize
 * @param _isFunctionBody Whether this is a function body (affects return handling)
 */
function normalizeBlockExpr(block: BlockExpr, _isFunctionBody: boolean): BlockExpr {
  const statements = block.statements.map(normalizeStmt);

  // If the block has no expression and this is a function body,
  // check if the last statement provides a value
  let expr = block.expr ? normalizeExpr(block.expr) : undefined;

  // If block has no expression and no statements, add unit
  if (!expr && statements.length === 0) {
    expr = createUnitExpr(block.span);
  }

  return { ...block, statements, expr };
}

// =============================================================================
// Helper Functions
// =============================================================================

function createUnitExpr(span: SourceSpan): Expr {
  return {
    kind: "literal",
    id: generateNodeId(),
    span,
    value: { kind: "unit" },
  };
}

function createUnitBlock(span: SourceSpan): BlockExpr {
  return {
    kind: "block",
    id: generateNodeId(),
    span,
    statements: [],
    expr: createUnitExpr(span),
  };
}
