/**
 * Constraint Solver
 *
 * A simple built-in solver for refinement predicates.
 * Handles basic cases without external SMT solvers.
 *
 * The solver can:
 * - Evaluate predicates with known constant values
 * - Apply simple arithmetic identities
 * - Use facts from the refinement context
 * - Return "unknown" for complex predicates
 */

import type { RefinementPredicate, RefinementTerm } from "../types/types";
import { formatPredicate } from "../types/types";
import type { RefinementContext } from "./context";

// =============================================================================
// Solver Result
// =============================================================================

export type SolverResult =
  | { status: "discharged" }
  | { status: "refuted"; counterexample?: Record<string, string> }
  | { status: "unknown"; reason: string };

// =============================================================================
// Main Solver Entry Point
// =============================================================================

/**
 * Attempt to prove a predicate given a context of known facts.
 */
export function solve(
  predicate: RefinementPredicate,
  context: RefinementContext
): SolverResult {
  // First, try to simplify the predicate
  const simplified = simplifyPredicate(predicate, context);

  // Check if it simplified to true/false
  if (simplified.kind === "true") {
    return { status: "discharged" };
  }

  if (simplified.kind === "false") {
    return {
      status: "refuted",
      counterexample: { _note: "Predicate is statically false" },
    };
  }

  // Try to prove using known facts
  if (proveFromFacts(simplified, context)) {
    return { status: "discharged" };
  }

  // Try to refute using known facts
  const refutation = refuteFromFacts(simplified, context);
  if (refutation) {
    return { status: "refuted", counterexample: refutation };
  }

  // Cannot determine
  return {
    status: "unknown",
    reason: `Cannot prove: ${formatPredicate(simplified)}`,
  };
}

// =============================================================================
// Predicate Simplification
// =============================================================================

/**
 * Simplify a predicate by evaluating constant expressions.
 */
function simplifyPredicate(
  pred: RefinementPredicate,
  ctx: RefinementContext
): RefinementPredicate {
  switch (pred.kind) {
    case "true":
    case "false":
    case "unknown":
      return pred;

    case "compare": {
      const left = simplifyTerm(pred.left, ctx);
      const right = simplifyTerm(pred.right, ctx);

      // Try to evaluate if both sides are constants
      const result = evaluateCompare(pred.op, left, right);
      if (result !== null) {
        return result ? { kind: "true" } : { kind: "false" };
      }

      return { kind: "compare", op: pred.op, left, right };
    }

    case "and": {
      const left = simplifyPredicate(pred.left, ctx);
      const right = simplifyPredicate(pred.right, ctx);

      if (left.kind === "false" || right.kind === "false") {
        return { kind: "false" };
      }
      if (left.kind === "true") return right;
      if (right.kind === "true") return left;

      return { kind: "and", left, right };
    }

    case "or": {
      const left = simplifyPredicate(pred.left, ctx);
      const right = simplifyPredicate(pred.right, ctx);

      if (left.kind === "true" || right.kind === "true") {
        return { kind: "true" };
      }
      if (left.kind === "false") return right;
      if (right.kind === "false") return left;

      return { kind: "or", left, right };
    }

    case "not": {
      const inner = simplifyPredicate(pred.inner, ctx);
      if (inner.kind === "true") return { kind: "false" };
      if (inner.kind === "false") return { kind: "true" };
      return { kind: "not", inner };
    }

    case "call":
      // Simplify arguments
      const args = pred.args.map((a) => simplifyTerm(a, ctx));

      // Handle known functions
      if (pred.name === "len" && args.length === 1) {
        // len([]) = 0, len([x]) = 1, etc.
        // For now, leave as is
      }

      return { kind: "call", name: pred.name, args };
  }
}

/**
 * Simplify a term by evaluating constant expressions.
 */
function simplifyTerm(term: RefinementTerm, ctx: RefinementContext): RefinementTerm {
  switch (term.kind) {
    case "int":
    case "bool":
    case "string":
      return term;

    case "var": {
      // Look up variable value in context
      const value = ctx.getVariableValue(term.name);
      if (value !== undefined) {
        return value;
      }
      return term;
    }

    case "binop": {
      const left = simplifyTerm(term.left, ctx);
      const right = simplifyTerm(term.right, ctx);

      // Try to evaluate if both sides are integer constants
      if (left.kind === "int" && right.kind === "int") {
        const result = evaluateBinop(term.op, left.value, right.value);
        if (result !== null) {
          return { kind: "int", value: result };
        }
      }

      return { kind: "binop", op: term.op, left, right };
    }

    case "call": {
      const args = term.args.map((a) => simplifyTerm(a, ctx));
      return { kind: "call", name: term.name, args };
    }

    case "field": {
      const base = simplifyTerm(term.base, ctx);
      return { kind: "field", base, field: term.field };
    }
  }
}

// =============================================================================
// Constant Evaluation
// =============================================================================

/**
 * Evaluate a comparison between two terms.
 * Returns null if cannot be evaluated.
 */
function evaluateCompare(
  op: string,
  left: RefinementTerm,
  right: RefinementTerm
): boolean | null {
  // Integer comparison
  if (left.kind === "int" && right.kind === "int") {
    const l = left.value;
    const r = right.value;
    switch (op) {
      case "==":
        return l === r;
      case "!=":
        return l !== r;
      case "<":
        return l < r;
      case "<=":
        return l <= r;
      case ">":
        return l > r;
      case ">=":
        return l >= r;
    }
  }

  // Boolean comparison
  if (left.kind === "bool" && right.kind === "bool") {
    switch (op) {
      case "==":
        return left.value === right.value;
      case "!=":
        return left.value !== right.value;
    }
  }

  // String comparison
  if (left.kind === "string" && right.kind === "string") {
    switch (op) {
      case "==":
        return left.value === right.value;
      case "!=":
        return left.value !== right.value;
    }
  }

  // Same variable - identity comparisons
  if (
    left.kind === "var" &&
    right.kind === "var" &&
    left.name === right.name
  ) {
    switch (op) {
      case "==":
      case "<=":
      case ">=":
        return true;
      case "!=":
      case "<":
      case ">":
        return false;
    }
  }

  return null;
}

/**
 * Evaluate a binary arithmetic operation.
 */
function evaluateBinop(op: string, left: bigint, right: bigint): bigint | null {
  switch (op) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      if (right === 0n) return null;
      return left / right;
    case "%":
      if (right === 0n) return null;
      return left % right;
    default:
      return null;
  }
}

// =============================================================================
// Fact-Based Proving
// =============================================================================

/**
 * Try to prove a predicate using known facts.
 */
function proveFromFacts(
  pred: RefinementPredicate,
  ctx: RefinementContext
): boolean {
  // Check if the predicate is directly in the facts
  for (const fact of ctx.getAllFacts()) {
    if (predicateImplies(fact.predicate, pred)) {
      return true;
    }
  }

  // For comparisons, try to derive from bounds
  if (pred.kind === "compare") {
    return proveCompareFromFacts(pred, ctx);
  }

  return false;
}

/**
 * Try to prove a comparison using known facts.
 */
function proveCompareFromFacts(
  pred: { kind: "compare"; op: string; left: RefinementTerm; right: RefinementTerm },
  ctx: RefinementContext
): boolean {
  const { op, left, right } = pred;

  // x > 0 can be proven from x >= 1, x > -1, etc.
  // x != 0 can be proven from x > 0 or x < 0

  for (const fact of ctx.getAllFacts()) {
    if (fact.predicate.kind !== "compare") continue;
    const f = fact.predicate;

    // Check if fact directly implies our predicate
    if (
      termsStructurallyEqual(f.left, left) &&
      termsStructurallyEqual(f.right, right)
    ) {
      if (opImplies(f.op, op)) {
        return true;
      }
    }

    // Check transitive relationships
    // If we have x > c1 and want to prove x > c2 where c2 < c1
    if (
      termsStructurallyEqual(f.left, left) &&
      f.right.kind === "int" &&
      right.kind === "int"
    ) {
      const fVal = f.right.value;
      const targetVal = right.value;

      // x > c1 implies x > c2 if c1 >= c2
      if (f.op === ">" && op === ">" && fVal >= targetVal) return true;
      // x >= c1 implies x > c2 if c1 > c2
      if (f.op === ">=" && op === ">" && fVal > targetVal) return true;
      // x >= c1 implies x >= c2 if c1 >= c2
      if (f.op === ">=" && op === ">=" && fVal >= targetVal) return true;
      // x > c1 implies x >= c2 if c1 >= c2
      if (f.op === ">" && op === ">=" && fVal >= targetVal) return true;

      // x < c1 implies x < c2 if c1 <= c2
      if (f.op === "<" && op === "<" && fVal <= targetVal) return true;
      // x <= c1 implies x < c2 if c1 < c2
      if (f.op === "<=" && op === "<" && fVal < targetVal) return true;
      // x <= c1 implies x <= c2 if c1 <= c2
      if (f.op === "<=" && op === "<=" && fVal <= targetVal) return true;
      // x < c1 implies x <= c2 if c1 <= c2
      if (f.op === "<" && op === "<=" && fVal <= targetVal) return true;

      // x > 0 implies x != 0
      if (f.op === ">" && op === "!=" && targetVal === 0n && fVal >= 0n) return true;
      // x < 0 implies x != 0
      if (f.op === "<" && op === "!=" && targetVal === 0n && fVal <= 0n) return true;
    }
  }

  return false;
}

/**
 * Check if one comparison operator implies another.
 */
function opImplies(known: string, target: string): boolean {
  // == implies ==, <=, >=
  if (known === "==") {
    return ["==", "<=", ">="].includes(target);
  }
  // < implies <, <=, !=
  if (known === "<") {
    return ["<", "<=", "!="].includes(target);
  }
  // > implies >, >=, !=
  if (known === ">") {
    return [">", ">=", "!="].includes(target);
  }
  // <= implies <=
  if (known === "<=") {
    return target === "<=";
  }
  // >= implies >=
  if (known === ">=") {
    return target === ">=";
  }
  // != implies !=
  if (known === "!=") {
    return target === "!=";
  }
  return false;
}

/**
 * Check if one predicate implies another.
 * This is a simplified check - just structural equality for now.
 */
function predicateImplies(
  known: RefinementPredicate,
  target: RefinementPredicate
): boolean {
  // Structural equality
  if (predicatesStructurallyEqual(known, target)) {
    return true;
  }

  // true implies true
  if (known.kind === "true" && target.kind === "true") {
    return true;
  }

  return false;
}

/**
 * Check structural equality of predicates.
 */
function predicatesStructurallyEqual(
  a: RefinementPredicate,
  b: RefinementPredicate
): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case "true":
    case "false":
      return true;
    case "unknown":
      return a.source === (b as typeof a).source;
    case "compare":
      return (
        a.op === (b as typeof a).op &&
        termsStructurallyEqual(a.left, (b as typeof a).left) &&
        termsStructurallyEqual(a.right, (b as typeof a).right)
      );
    case "and":
    case "or":
      return (
        predicatesStructurallyEqual(a.left, (b as typeof a).left) &&
        predicatesStructurallyEqual(a.right, (b as typeof a).right)
      );
    case "not":
      return predicatesStructurallyEqual(a.inner, (b as typeof a).inner);
    case "call":
      return (
        a.name === (b as typeof a).name &&
        a.args.length === (b as typeof a).args.length &&
        a.args.every((arg, i) =>
          termsStructurallyEqual(arg, (b as typeof a).args[i])
        )
      );
  }
}

/**
 * Check structural equality of terms.
 */
function termsStructurallyEqual(a: RefinementTerm, b: RefinementTerm): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case "var":
      return a.name === (b as typeof a).name;
    case "int":
      return a.value === (b as typeof a).value;
    case "bool":
      return a.value === (b as typeof a).value;
    case "string":
      return a.value === (b as typeof a).value;
    case "binop":
      return (
        a.op === (b as typeof a).op &&
        termsStructurallyEqual(a.left, (b as typeof a).left) &&
        termsStructurallyEqual(a.right, (b as typeof a).right)
      );
    case "call":
      return (
        a.name === (b as typeof a).name &&
        a.args.length === (b as typeof a).args.length &&
        a.args.every((arg, i) =>
          termsStructurallyEqual(arg, (b as typeof a).args[i])
        )
      );
    case "field":
      return (
        a.field === (b as typeof a).field &&
        termsStructurallyEqual(a.base, (b as typeof a).base)
      );
  }
}

// =============================================================================
// Fact-Based Refutation
// =============================================================================

/**
 * Try to refute a predicate using known facts.
 * Returns a counterexample if refuted, null otherwise.
 */
function refuteFromFacts(
  pred: RefinementPredicate,
  ctx: RefinementContext
): Record<string, string> | null {
  // Check if the negation of the predicate is in the facts
  for (const fact of ctx.getAllFacts()) {
    if (predicateContradicts(fact.predicate, pred)) {
      return { _source: fact.source };
    }
  }

  return null;
}

/**
 * Check if one predicate contradicts another.
 */
function predicateContradicts(
  known: RefinementPredicate,
  target: RefinementPredicate
): boolean {
  // x > 0 contradicts x <= 0, x < 0, x == 0
  if (known.kind === "compare" && target.kind === "compare") {
    if (
      termsStructurallyEqual(known.left, target.left) &&
      termsStructurallyEqual(known.right, target.right)
    ) {
      return opsContradict(known.op, target.op);
    }
  }

  return false;
}

/**
 * Check if two comparison operators contradict each other.
 */
function opsContradict(a: string, b: string): boolean {
  const contradictions: Record<string, string[]> = {
    "==": ["!=", "<", ">"],
    "!=": ["=="],
    "<": [">=", ">", "=="],
    "<=": [">"],
    ">": ["<=", "<", "=="],
    ">=": ["<"],
  };
  return contradictions[a]?.includes(b) ?? false;
}
