/**
 * Counterexample Generation
 *
 * Generates concrete counterexamples for refinement predicates that cannot be
 * satisfied. Counterexamples show specific variable assignments that violate
 * the predicate, helping users understand why their code doesn't type-check.
 *
 * ## Overview
 *
 * The counterexample system supports three types of generation:
 *
 * 1. **Static False** - When a predicate simplifies to `false` (e.g., `0 > 5`)
 * 2. **Contradiction** - When a predicate contradicts a known fact
 * 3. **Candidate** - When a predicate can't be proven, suggest potential violations
 *
 * ## Usage
 *
 * ```typescript
 * import { solve } from "./solver";
 * import { RefinementContext } from "./context";
 *
 * const ctx = new RefinementContext();
 * ctx.addFact(predicate, "source");
 *
 * const result = solve(goal, ctx);
 * if (result.status === "refuted") {
 *   // Definite counterexample
 *   console.log(result.counterexample);
 * } else if (result.status === "unknown") {
 *   // Candidate counterexample (may be undefined)
 *   console.log(result.candidate_counterexample);
 * }
 * ```
 *
 * ## Counterexample Format
 *
 * The `Record<string, string>` format includes:
 * - Variable assignments: `{ x: "5", y: "-3" }`
 * - Metadata prefixed with `_`:
 *   - `_explanation`: Human-readable reason for failure
 *   - `_violated`: The predicate that failed
 *   - `_contradicts`: The fact that contradicted the predicate
 *
 * @module refinements/counterexample
 */

import type { RefinementPredicate, RefinementTerm, CompareOp } from "../types/types";
import { formatPredicate } from "../types/types";
import type { RefinementContext, Fact } from "./context";

// =============================================================================
// Counterexample Types
// =============================================================================

/**
 * A counterexample is a map from variable names to their string-formatted values,
 * along with an explanation of why the predicate fails.
 */
export interface Counterexample {
  /** Variable assignments that cause the predicate to fail */
  assignments: Record<string, string>;
  /** Human-readable explanation of why the predicate fails */
  explanation: string;
  /** The specific predicate that was violated */
  violated_predicate?: string;
  /** Source of the contradicting fact (if any) */
  contradicting_fact?: string;
}

/**
 * Convert a Counterexample to the Record<string, string> format used in diagnostics.
 */
export function counterexampleToRecord(ce: Counterexample): Record<string, string> {
  return {
    ...ce.assignments,
    _explanation: ce.explanation,
    ...(ce.violated_predicate ? { _violated: ce.violated_predicate } : {}),
    ...(ce.contradicting_fact ? { _contradicts: ce.contradicting_fact } : {}),
  };
}

// =============================================================================
// Counterexample Generation for Refuted Predicates
// =============================================================================

/**
 * Generate a counterexample for a predicate that was statically determined to be false.
 * This happens when the predicate simplifies to `false` (e.g., 0 > 5).
 */
export function generateStaticFalseCounterexample(
  predicate: RefinementPredicate
): Counterexample {
  const assignments: Record<string, string> = {};

  // Extract variables and their implied values from the predicate
  collectVariablesFromPredicate(predicate, assignments);

  return {
    assignments,
    explanation: `Predicate '${formatPredicate(predicate)}' is statically false`,
    violated_predicate: formatPredicate(predicate),
  };
}

/**
 * Generate a counterexample when a predicate contradicts a known fact.
 */
export function generateContradictionCounterexample(
  predicate: RefinementPredicate,
  contradictingFact: Fact,
  _ctx: RefinementContext
): Counterexample {
  const assignments: Record<string, string> = {};

  // Collect variables from both the predicate and the contradicting fact
  collectVariablesFromPredicate(predicate, assignments);
  collectVariablesFromPredicate(contradictingFact.predicate, assignments);

  // Try to find concrete values that satisfy the fact but violate the predicate
  tryFindConcreteValues(predicate, contradictingFact.predicate, assignments);

  return {
    assignments,
    explanation: `Predicate '${formatPredicate(predicate)}' contradicts known fact '${formatPredicate(contradictingFact.predicate)}'`,
    violated_predicate: formatPredicate(predicate),
    contradicting_fact: `${formatPredicate(contradictingFact.predicate)} (from: ${contradictingFact.source})`,
  };
}

/**
 * Generate a counterexample based on bound violations.
 * For example, if we know x > 5 but need x < 3, we can show x = 6 as a counterexample.
 */
export function generateBoundsCounterexample(
  predicate: RefinementPredicate,
  knownFact: Fact,
  _ctx: RefinementContext
): Counterexample {
  const assignments: Record<string, string> = {};

  // Extract variable and bounds from both predicates
  if (predicate.kind === "compare" && knownFact.predicate.kind === "compare") {
    const varName = getVariableName(predicate.left) ?? getVariableName(predicate.right);

    if (varName) {
      // Try to find a value that satisfies the fact but violates the predicate
      const concreteValue = findViolatingValue(predicate, knownFact.predicate);
      if (concreteValue !== null) {
        assignments[varName] = concreteValue.toString();
      }
    }
  }

  return {
    assignments,
    explanation: `Cannot satisfy '${formatPredicate(predicate)}' when '${formatPredicate(knownFact.predicate)}' holds`,
    violated_predicate: formatPredicate(predicate),
    contradicting_fact: `${formatPredicate(knownFact.predicate)} (from: ${knownFact.source})`,
  };
}

// =============================================================================
// Counterexample Generation for Unknown Predicates
// =============================================================================

/**
 * Attempt to generate a candidate counterexample for a predicate that couldn't
 * be proven. This is useful for "unknown" solver results to help users understand
 * what conditions might cause the predicate to fail.
 */
export function generateCandidateCounterexample(
  predicate: RefinementPredicate,
  _ctx: RefinementContext
): Counterexample | null {
  const assignments: Record<string, string> = {};
  const variables = collectAllVariables(predicate);

  if (variables.size === 0) {
    return null;
  }

  // Try to find values that would violate the predicate
  for (const varName of variables) {
    // Check if we have any bounds on this variable from context
    const bounds = collectBoundsFromContext(varName, _ctx);

    // Find a value that satisfies existing bounds but might violate the predicate
    const candidateValue = findCandidateViolatingValue(varName, predicate, bounds);
    if (candidateValue !== null) {
      assignments[varName] = candidateValue.toString();
    }
  }

  if (Object.keys(assignments).length === 0) {
    return null;
  }

  return {
    assignments,
    explanation: `Possible counterexample: these values might violate '${formatPredicate(predicate)}'`,
    violated_predicate: formatPredicate(predicate),
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Collect all variable names from a predicate into a set.
 */
function collectAllVariables(predicate: RefinementPredicate): Set<string> {
  const vars = new Set<string>();

  function collectFromPred(p: RefinementPredicate): void {
    switch (p.kind) {
      case "compare":
        collectFromTerm(p.left);
        collectFromTerm(p.right);
        break;
      case "and":
      case "or":
        collectFromPred(p.left);
        collectFromPred(p.right);
        break;
      case "not":
        collectFromPred(p.inner);
        break;
      case "call":
        for (const arg of p.args) {
          collectFromTerm(arg);
        }
        break;
    }
  }

  function collectFromTerm(t: RefinementTerm): void {
    switch (t.kind) {
      case "var":
        vars.add(t.name);
        break;
      case "binop":
        collectFromTerm(t.left);
        collectFromTerm(t.right);
        break;
      case "call":
        for (const arg of t.args) {
          collectFromTerm(arg);
        }
        break;
      case "field":
        collectFromTerm(t.base);
        break;
    }
  }

  collectFromPred(predicate);
  return vars;
}

/**
 * Collect variables from a predicate and try to infer concrete values.
 */
function collectVariablesFromPredicate(
  predicate: RefinementPredicate,
  assignments: Record<string, string>
): void {
  const vars = collectAllVariables(predicate);
  for (const v of vars) {
    if (!(v in assignments)) {
      assignments[v] = "?";
    }
  }
}

/**
 * Get the variable name from a term if it's a simple variable.
 */
function getVariableName(term: RefinementTerm): string | null {
  if (term.kind === "var") {
    return term.name;
  }
  if (term.kind === "binop") {
    return getVariableName(term.left) ?? getVariableName(term.right);
  }
  return null;
}

/**
 * Get the constant value from a term if it's a constant.
 */
function getConstantValue(term: RefinementTerm): bigint | null {
  if (term.kind === "int") {
    return term.value;
  }
  return null;
}

/**
 * Try to find concrete values that satisfy knownFact but violate predicate.
 */
function tryFindConcreteValues(
  predicate: RefinementPredicate,
  knownFact: RefinementPredicate,
  assignments: Record<string, string>
): void {
  // For compare predicates, try to extract bounds
  if (predicate.kind === "compare" && knownFact.kind === "compare") {
    const varName = getVariableName(predicate.left) ?? getVariableName(predicate.right);
    if (varName) {
      const value = findViolatingValue(predicate, knownFact);
      if (value !== null) {
        assignments[varName] = value.toString();
      }
    }
  }
}

/**
 * Find a value that satisfies knownFact but violates targetPred.
 */
function findViolatingValue(
  targetPred: RefinementPredicate,
  knownFact: RefinementPredicate
): bigint | null {
  if (targetPred.kind !== "compare" || knownFact.kind !== "compare") {
    return null;
  }

  // Get the constant from the known fact (assumed to be on the right)
  const factConst = getConstantValue(knownFact.right);
  const targetConst = getConstantValue(targetPred.right);

  if (factConst === null) return null;

  // Based on the known fact's operator, find a value that satisfies it
  // but violates the target predicate
  switch (knownFact.op) {
    case ">":
      // Known: x > c, so x = c + 1 satisfies the fact
      return factConst + 1n;
    case ">=":
      // Known: x >= c, so x = c satisfies the fact
      return factConst;
    case "<":
      // Known: x < c, so x = c - 1 satisfies the fact
      return factConst - 1n;
    case "<=":
      // Known: x <= c, so x = c satisfies the fact
      return factConst;
    case "==":
      // Known: x == c, so x = c
      return factConst;
    case "!=":
      // Known: x != c, use c + 1 or c - 1
      if (targetConst !== null && targetConst === factConst + 1n) {
        return factConst - 1n;
      }
      return factConst + 1n;
  }

  return null;
}

/**
 * Collect bounds on a variable from the context.
 */
interface VariableBounds {
  lower?: { value: bigint; inclusive: boolean };
  upper?: { value: bigint; inclusive: boolean };
  equals?: bigint;
  notEquals: bigint[];
}

function collectBoundsFromContext(varName: string, ctx: RefinementContext): VariableBounds {
  const bounds: VariableBounds = { notEquals: [] };

  for (const fact of ctx.getAllFacts()) {
    if (fact.predicate.kind !== "compare") continue;

    const { left, right, op } = fact.predicate;

    // Check if this fact is about our variable (on the left side)
    if (left.kind === "var" && left.name === varName && right.kind === "int") {
      const c = right.value;
      switch (op) {
        case ">":
          if (!bounds.lower || c >= bounds.lower.value) {
            bounds.lower = { value: c, inclusive: false };
          }
          break;
        case ">=":
          if (!bounds.lower || c > bounds.lower.value) {
            bounds.lower = { value: c, inclusive: true };
          }
          break;
        case "<":
          if (!bounds.upper || c <= bounds.upper.value) {
            bounds.upper = { value: c, inclusive: false };
          }
          break;
        case "<=":
          if (!bounds.upper || c < bounds.upper.value) {
            bounds.upper = { value: c, inclusive: true };
          }
          break;
        case "==":
          bounds.equals = c;
          break;
        case "!=":
          bounds.notEquals.push(c);
          break;
      }
    }

    // Also check for variable on the right side (flipped comparison)
    if (right.kind === "var" && right.name === varName && left.kind === "int") {
      const c = left.value;
      switch (op) {
        case "<": // c < x means x > c
          if (!bounds.lower || c >= bounds.lower.value) {
            bounds.lower = { value: c, inclusive: false };
          }
          break;
        case "<=": // c <= x means x >= c
          if (!bounds.lower || c > bounds.lower.value) {
            bounds.lower = { value: c, inclusive: true };
          }
          break;
        case ">": // c > x means x < c
          if (!bounds.upper || c <= bounds.upper.value) {
            bounds.upper = { value: c, inclusive: false };
          }
          break;
        case ">=": // c >= x means x <= c
          if (!bounds.upper || c < bounds.upper.value) {
            bounds.upper = { value: c, inclusive: true };
          }
          break;
      }
    }
  }

  return bounds;
}

/**
 * Find a candidate value that might violate the predicate while respecting known bounds.
 */
function findCandidateViolatingValue(
  varName: string,
  predicate: RefinementPredicate,
  bounds: VariableBounds
): bigint | null {
  // If we have an exact equality constraint, use that
  if (bounds.equals !== undefined) {
    return bounds.equals;
  }

  // Find what the predicate requires
  const required = extractRequirement(varName, predicate);
  if (!required) return null;

  // Try to find a value that satisfies bounds but violates the requirement
  // This helps show what value would fail the check

  // Strategy: find a value at the boundary of what's allowed by bounds
  // but fails the predicate requirement

  let candidate: bigint | null = null;

  switch (required.op) {
    case ">": {
      // Predicate needs x > c, so find a value <= c within bounds
      const targetValue = required.value;
      if (bounds.lower) {
        // We know x > lower or x >= lower
        const minAllowed = bounds.lower.inclusive ? bounds.lower.value : bounds.lower.value + 1n;
        // Value that satisfies bounds but might fail predicate
        if (minAllowed <= targetValue) {
          candidate = minAllowed;
        }
      } else {
        // No lower bound, so we can use targetValue
        candidate = targetValue;
      }
      break;
    }
    case ">=": {
      const targetValue = required.value;
      if (bounds.lower) {
        const minAllowed = bounds.lower.inclusive ? bounds.lower.value : bounds.lower.value + 1n;
        if (minAllowed < targetValue) {
          candidate = minAllowed;
        }
      } else {
        candidate = targetValue - 1n;
      }
      break;
    }
    case "<": {
      const targetValue = required.value;
      if (bounds.upper) {
        const maxAllowed = bounds.upper.inclusive ? bounds.upper.value : bounds.upper.value - 1n;
        if (maxAllowed >= targetValue) {
          candidate = maxAllowed;
        }
      } else {
        candidate = targetValue;
      }
      break;
    }
    case "<=": {
      const targetValue = required.value;
      if (bounds.upper) {
        const maxAllowed = bounds.upper.inclusive ? bounds.upper.value : bounds.upper.value - 1n;
        if (maxAllowed > targetValue) {
          candidate = maxAllowed;
        }
      } else {
        candidate = targetValue + 1n;
      }
      break;
    }
    case "==": {
      // Need x == c, find a value != c within bounds
      const targetValue = required.value;
      if (bounds.lower) {
        const minAllowed = bounds.lower.inclusive ? bounds.lower.value : bounds.lower.value + 1n;
        if (minAllowed !== targetValue) {
          candidate = minAllowed;
        } else {
          candidate = minAllowed + 1n;
        }
      } else {
        candidate = targetValue + 1n;
      }
      break;
    }
    case "!=": {
      // Need x != c, we want exactly c
      candidate = required.value;
      break;
    }
  }

  // Verify candidate doesn't violate bounds
  if (candidate !== null) {
    if (bounds.lower) {
      const minAllowed = bounds.lower.inclusive ? bounds.lower.value : bounds.lower.value + 1n;
      if (candidate < minAllowed) return null;
    }
    if (bounds.upper) {
      const maxAllowed = bounds.upper.inclusive ? bounds.upper.value : bounds.upper.value - 1n;
      if (candidate > maxAllowed) return null;
    }
  }

  return candidate;
}

/**
 * Extract what a predicate requires from a specific variable.
 */
function extractRequirement(
  varName: string,
  predicate: RefinementPredicate
): { op: CompareOp; value: bigint } | null {
  if (predicate.kind !== "compare") return null;

  const { left, right, op } = predicate;

  // Variable on left: x op c
  if (left.kind === "var" && left.name === varName && right.kind === "int") {
    return { op, value: right.value };
  }

  // Variable on right: c op x - flip the operator
  if (right.kind === "var" && right.name === varName && left.kind === "int") {
    const flipped = flipOp(op);
    if (flipped) {
      return { op: flipped, value: left.value };
    }
  }

  // Handle binop expressions like (x + 1) > c
  if (left.kind === "binop" && right.kind === "int") {
    const extracted = extractVariableFromBinop(left, varName);
    if (extracted) {
      // Adjust the constant based on the operation
      // e.g., (x + 1) > 5 means x > 4
      const adjustedValue =
        extracted.op === "+"
          ? right.value - extracted.constant
          : right.value + extracted.constant;
      return { op, value: adjustedValue };
    }
  }

  return null;
}

/**
 * Extract variable and constant from a binop like (x + 1) or (x - 2).
 */
function extractVariableFromBinop(
  term: RefinementTerm,
  varName: string
): { op: string; constant: bigint } | null {
  if (term.kind !== "binop") return null;

  const { left, right, op } = term;

  if (left.kind === "var" && left.name === varName && right.kind === "int") {
    return { op, constant: right.value };
  }

  if (right.kind === "var" && right.name === varName && left.kind === "int") {
    // e.g., (1 + x) is same as (x + 1) for +
    if (op === "+") {
      return { op, constant: left.value };
    }
  }

  return null;
}

/**
 * Flip a comparison operator.
 */
function flipOp(op: CompareOp): CompareOp | null {
  const flipped: Record<CompareOp, CompareOp> = {
    "<": ">",
    "<=": ">=",
    ">": "<",
    ">=": "<=",
    "==": "==",
    "!=": "!=",
  };
  return flipped[op];
}
