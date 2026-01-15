/**
 * Constraint Extraction
 *
 * Converts AST Expr nodes to simplified RefinementPredicate/RefinementTerm
 * for easier analysis and solving.
 */

import type { Expr, BinaryExpr } from "../parser/ast";
import type {
  RefinementPredicate,
  RefinementTerm,
  CompareOp,
} from "../types/types";
import { formatPredicate } from "../types/types";

// =============================================================================
// AST Expression to Predicate Conversion
// =============================================================================

/**
 * Convert an AST expression to a refinement predicate.
 * For expressions that can't be converted, returns an "unknown" predicate.
 */
export function extractPredicate(expr: Expr): RefinementPredicate {
  switch (expr.kind) {
    case "literal":
      if (expr.value.kind === "bool") {
        return expr.value.value ? { kind: "true" } : { kind: "false" };
      }
      return { kind: "unknown", source: formatExpr(expr) };

    case "binary":
      return extractBinaryPredicate(expr);

    case "unary":
      if (expr.op === "!" || expr.op === "¬") {
        return { kind: "not", inner: extractPredicate(expr.operand) };
      }
      return { kind: "unknown", source: formatExpr(expr) };

    case "call":
      // Function calls in predicates (e.g., len(arr) > 0)
      // We extract them as terms and let the caller handle
      const args = expr.args.map(extractTerm);
      if (expr.callee.kind === "ident") {
        return { kind: "call", name: expr.callee.name, args };
      }
      return { kind: "unknown", source: formatExpr(expr) };

    case "ident":
      // A bare identifier as a predicate (e.g., just "is_valid")
      return { kind: "call", name: expr.name, args: [] };

    default:
      return { kind: "unknown", source: formatExpr(expr) };
  }
}

/**
 * Convert a binary expression to a predicate.
 */
function extractBinaryPredicate(expr: BinaryExpr): RefinementPredicate {
  const op = expr.op;

  // Comparison operators
  if (isCompareOp(op)) {
    return {
      kind: "compare",
      op: normalizeCompareOp(op),
      left: extractTerm(expr.left),
      right: extractTerm(expr.right),
    };
  }

  // Logical operators
  if (op === "&&" || op === "∧") {
    return {
      kind: "and",
      left: extractPredicate(expr.left),
      right: extractPredicate(expr.right),
    };
  }

  if (op === "||" || op === "∨") {
    return {
      kind: "or",
      left: extractPredicate(expr.left),
      right: extractPredicate(expr.right),
    };
  }

  return { kind: "unknown", source: formatExpr(expr) };
}

/**
 * Check if an operator is a comparison operator.
 */
function isCompareOp(op: string): boolean {
  return ["==", "!=", "≠", "<", "<=", "≤", ">", ">=", "≥"].includes(op);
}

/**
 * Normalize comparison operators (convert Unicode to ASCII).
 */
function normalizeCompareOp(op: string): CompareOp {
  switch (op) {
    case "==":
      return "==";
    case "!=":
    case "≠":
      return "!=";
    case "<":
      return "<";
    case "<=":
    case "≤":
      return "<=";
    case ">":
      return ">";
    case ">=":
    case "≥":
      return ">=";
    default:
      return "=="; // Fallback
  }
}

// =============================================================================
// AST Expression to Term Conversion
// =============================================================================

/**
 * Convert an AST expression to a refinement term.
 */
export function extractTerm(expr: Expr): RefinementTerm {
  switch (expr.kind) {
    case "literal":
      switch (expr.value.kind) {
        case "int":
          return { kind: "int", value: expr.value.value };
        case "bool":
          return { kind: "bool", value: expr.value.value };
        case "string":
          return { kind: "string", value: expr.value.value };
        default:
          return { kind: "var", name: formatExpr(expr) };
      }

    case "ident":
      return { kind: "var", name: expr.name };

    case "binary": {
      // Arithmetic operators become binop terms
      const op = expr.op;
      if (["+", "-", "*", "/", "%"].includes(op)) {
        return {
          kind: "binop",
          op,
          left: extractTerm(expr.left),
          right: extractTerm(expr.right),
        };
      }
      // Other operators (comparisons, logical) - treat as unknown
      return { kind: "var", name: formatExpr(expr) };
    }

    case "call":
      if (expr.callee.kind === "ident") {
        return {
          kind: "call",
          name: expr.callee.name,
          args: expr.args.map(extractTerm),
        };
      }
      return { kind: "var", name: formatExpr(expr) };

    case "field":
      return {
        kind: "field",
        base: extractTerm(expr.object),
        field: expr.name,
      };

    case "index":
      // arr[i] - treat as a function call for simplicity
      return {
        kind: "call",
        name: "index",
        args: [extractTerm(expr.object), extractTerm(expr.index)],
      };

    default:
      return { kind: "var", name: formatExpr(expr) };
  }
}

// =============================================================================
// Expression Formatting (for unknown predicates/terms)
// =============================================================================

/**
 * Simple expression formatter for creating "unknown" predicate sources.
 */
function formatExpr(expr: Expr): string {
  switch (expr.kind) {
    case "literal":
      switch (expr.value.kind) {
        case "int":
          return expr.value.value.toString();
        case "float":
          return expr.value.value.toString();
        case "string":
          return `"${expr.value.value}"`;
        case "bool":
          return expr.value.value.toString();
        case "unit":
          return "()";
        case "template":
          return `\`${expr.value.value}\``;
      }
      break;

    case "ident":
      return expr.name;

    case "binary":
      return `(${formatExpr(expr.left)} ${expr.op} ${formatExpr(expr.right)})`;

    case "unary":
      return `${expr.op}${formatExpr(expr.operand)}`;

    case "call":
      return `${formatExpr(expr.callee)}(${expr.args.map(formatExpr).join(", ")})`;

    case "field":
      return `${formatExpr(expr.object)}.${expr.name}`;

    case "index":
      return `${formatExpr(expr.object)}[${formatExpr(expr.index)}]`;

    default:
      return "<expr>";
  }
}

// =============================================================================
// Predicate Manipulation
// =============================================================================

/**
 * Substitute a variable name in a predicate.
 * Useful for renaming the refinement variable.
 */
export function substitutePredicate(
  pred: RefinementPredicate,
  oldVar: string,
  newVar: string
): RefinementPredicate {
  switch (pred.kind) {
    case "compare":
      return {
        kind: "compare",
        op: pred.op,
        left: substituteTerm(pred.left, oldVar, newVar),
        right: substituteTerm(pred.right, oldVar, newVar),
      };
    case "and":
      return {
        kind: "and",
        left: substitutePredicate(pred.left, oldVar, newVar),
        right: substitutePredicate(pred.right, oldVar, newVar),
      };
    case "or":
      return {
        kind: "or",
        left: substitutePredicate(pred.left, oldVar, newVar),
        right: substitutePredicate(pred.right, oldVar, newVar),
      };
    case "not":
      return {
        kind: "not",
        inner: substitutePredicate(pred.inner, oldVar, newVar),
      };
    case "call":
      return {
        kind: "call",
        name: pred.name,
        args: pred.args.map((a) => substituteTerm(a, oldVar, newVar)),
      };
    case "true":
    case "false":
    case "unknown":
      return pred;
  }
}

/**
 * Substitute a variable name in a term.
 */
export function substituteTerm(
  term: RefinementTerm,
  oldVar: string,
  newVar: string
): RefinementTerm {
  switch (term.kind) {
    case "var":
      return term.name === oldVar ? { kind: "var", name: newVar } : term;
    case "int":
    case "bool":
    case "string":
      return term;
    case "binop":
      return {
        kind: "binop",
        op: term.op,
        left: substituteTerm(term.left, oldVar, newVar),
        right: substituteTerm(term.right, oldVar, newVar),
      };
    case "call":
      return {
        kind: "call",
        name: term.name,
        args: term.args.map((a) => substituteTerm(a, oldVar, newVar)),
      };
    case "field":
      return {
        kind: "field",
        base: substituteTerm(term.base, oldVar, newVar),
        field: term.field,
      };
  }
}
