/**
 * Refinement Context
 *
 * Tracks known facts and variable bindings for refinement checking.
 * Used by the solver to prove/refute predicates.
 */

import type { RefinementPredicate, RefinementTerm, CompareOp } from "../types/types";
import { formatPredicate } from "../types/types";

// =============================================================================
// Facts
// =============================================================================

/**
 * A known fact in the refinement context.
 */
export interface Fact {
  predicate: RefinementPredicate;
  source: string; // Where this fact came from (for debugging/error messages)
}

// =============================================================================
// Refinement Context
// =============================================================================

/**
 * Context for refinement checking.
 * Tracks known facts and variable values.
 */
export class RefinementContext {
  /** Known facts (predicates that are true in this context) */
  facts: Fact[] = [];

  /** Known variable values */
  private values: Map<string, RefinementTerm> = new Map();

  /** Parent context (for scoping) */
  private parent: RefinementContext | null = null;

  constructor(parent?: RefinementContext) {
    this.parent = parent ?? null;
    if (parent) {
      // Don't copy facts - we access them through the parent chain
    }
  }

  // ---------------------------------------------------------------------------
  // Fact Management
  // ---------------------------------------------------------------------------

  /**
   * Add a fact to the context.
   */
  addFact(predicate: RefinementPredicate, source: string): void {
    this.facts.push({ predicate, source });
  }

  /**
   * Add a fact from a comparison expression.
   */
  addComparison(
    op: string,
    left: RefinementTerm,
    right: RefinementTerm,
    source: string
  ): void {
    const normalizedOp = this.normalizeOp(op);
    if (normalizedOp) {
      this.addFact(
        { kind: "compare", op: normalizedOp, left, right },
        source
      );
    }
  }

  /**
   * Get all facts, including from parent contexts.
   */
  getAllFacts(): Fact[] {
    const result = [...this.facts];
    let ctx: RefinementContext | null = this.parent;
    while (ctx) {
      result.push(...ctx.facts);
      ctx = ctx.parent;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Variable Values
  // ---------------------------------------------------------------------------

  /**
   * Set a variable to a known value.
   */
  setVariableValue(name: string, value: RefinementTerm): void {
    this.values.set(name, value);
  }

  /**
   * Get a variable's known value.
   */
  getVariableValue(name: string): RefinementTerm | undefined {
    const local = this.values.get(name);
    if (local) return local;
    return this.parent?.getVariableValue(name);
  }

  // ---------------------------------------------------------------------------
  // Scoping
  // ---------------------------------------------------------------------------

  /**
   * Create a child context for a new scope.
   */
  child(): RefinementContext {
    return new RefinementContext(this);
  }

  /**
   * Create a child context with additional facts (e.g., from an if condition).
   */
  withFact(predicate: RefinementPredicate, source: string): RefinementContext {
    const ctx = this.child();
    ctx.addFact(predicate, source);
    return ctx;
  }

  /**
   * Create a child context with the negation of a predicate.
   * Used for else branches.
   */
  withNegatedFact(predicate: RefinementPredicate, source: string): RefinementContext {
    const ctx = this.child();
    ctx.addFact({ kind: "not", inner: predicate }, source);

    // Also add more specific facts for comparisons
    if (predicate.kind === "compare") {
      const negatedOp = this.negateOp(predicate.op);
      if (negatedOp) {
        ctx.addFact(
          { kind: "compare", op: negatedOp, left: predicate.left, right: predicate.right },
          source
        );
      }
    }

    return ctx;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalizeOp(op: string): CompareOp | null {
    const normalized: Record<string, CompareOp> = {
      "==": "==",
      "!=": "!=",
      "≠": "!=",
      "<": "<",
      "<=": "<=",
      "≤": "<=",
      ">": ">",
      ">=": ">=",
      "≥": ">=",
    };
    return normalized[op] ?? null;
  }

  private negateOp(op: CompareOp): CompareOp {
    const negations: Record<CompareOp, CompareOp> = {
      "==": "!=",
      "!=": "==",
      "<": ">=",
      "<=": ">",
      ">": "<=",
      ">=": "<",
    };
    return negations[op];
  }

  // ---------------------------------------------------------------------------
  // Debug
  // ---------------------------------------------------------------------------

  /**
   * Format the context for debugging.
   */
  toString(): string {
    const facts = this.getAllFacts();
    if (facts.length === 0) {
      return "RefinementContext (no facts)";
    }
    return `RefinementContext:\n${facts
      .map((f) => `  - ${formatPredicate(f.predicate)} [${f.source}]`)
      .join("\n")}`;
  }
}

// =============================================================================
// Context Builder
// =============================================================================

/**
 * Helper for building refinement contexts from various sources.
 */
export class ContextBuilder {
  private ctx: RefinementContext;

  constructor(parent?: RefinementContext) {
    this.ctx = new RefinementContext(parent);
  }

  /**
   * Add a fact from a refinement type.
   * The predicate's variable is substituted with the actual variable name.
   */
  fromRefinement(
    varName: string,
    predicate: RefinementPredicate,
    refinementVar: string
  ): this {
    // Substitute the refinement variable with the actual variable
    const substituted = this.substitutePredicate(predicate, refinementVar, varName);
    this.ctx.addFact(substituted, `refinement on ${varName}`);
    return this;
  }

  /**
   * Add a fact from a precondition.
   */
  fromPrecondition(predicate: RefinementPredicate): this {
    this.ctx.addFact(predicate, "precondition");
    return this;
  }

  /**
   * Add a fact from an if condition (in the then branch).
   */
  fromCondition(predicate: RefinementPredicate): this {
    this.ctx.addFact(predicate, "if condition");
    return this;
  }

  /**
   * Build the context.
   */
  build(): RefinementContext {
    return this.ctx;
  }

  private substitutePredicate(
    pred: RefinementPredicate,
    oldVar: string,
    newVar: string
  ): RefinementPredicate {
    // Import from extract.ts would create circular dependency,
    // so we inline a simple version here
    switch (pred.kind) {
      case "compare":
        return {
          kind: "compare",
          op: pred.op,
          left: this.substituteTerm(pred.left, oldVar, newVar),
          right: this.substituteTerm(pred.right, oldVar, newVar),
        };
      case "and":
        return {
          kind: "and",
          left: this.substitutePredicate(pred.left, oldVar, newVar),
          right: this.substitutePredicate(pred.right, oldVar, newVar),
        };
      case "or":
        return {
          kind: "or",
          left: this.substitutePredicate(pred.left, oldVar, newVar),
          right: this.substitutePredicate(pred.right, oldVar, newVar),
        };
      case "not":
        return {
          kind: "not",
          inner: this.substitutePredicate(pred.inner, oldVar, newVar),
        };
      case "call":
        return {
          kind: "call",
          name: pred.name,
          args: pred.args.map((a) => this.substituteTerm(a, oldVar, newVar)),
        };
      case "true":
      case "false":
      case "unknown":
        return pred;
    }
  }

  private substituteTerm(
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
          left: this.substituteTerm(term.left, oldVar, newVar),
          right: this.substituteTerm(term.right, oldVar, newVar),
        };
      case "call":
        return {
          kind: "call",
          name: term.name,
          args: term.args.map((a) => this.substituteTerm(a, oldVar, newVar)),
        };
      case "field":
        return {
          kind: "field",
          base: this.substituteTerm(term.base, oldVar, newVar),
          field: term.field,
        };
    }
  }
}
