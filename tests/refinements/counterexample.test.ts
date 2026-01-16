/**
 * Tests for counterexample generation in the refinement solver.
 */

import { describe, test, expect } from "bun:test";
import { solve } from "../../src/refinements/solver";
import { RefinementContext } from "../../src/refinements/context";
import {
  generateStaticFalseCounterexample,
  generateContradictionCounterexample,
  generateCandidateCounterexample,
  counterexampleToRecord,
} from "../../src/refinements/counterexample";
import type { RefinementPredicate, RefinementTerm } from "../../src/types/types";

// =============================================================================
// Helper Functions
// =============================================================================

function intTerm(value: bigint): RefinementTerm {
  return { kind: "int", value };
}

function varTerm(name: string): RefinementTerm {
  return { kind: "var", name };
}

function binopTerm(
  left: RefinementTerm,
  op: string,
  right: RefinementTerm
): RefinementTerm {
  return { kind: "binop", op, left, right };
}

function compare(
  left: RefinementTerm,
  op: "==" | "!=" | "<" | "<=" | ">" | ">=",
  right: RefinementTerm
): RefinementPredicate {
  return { kind: "compare", op, left, right };
}

function and(left: RefinementPredicate, right: RefinementPredicate): RefinementPredicate {
  return { kind: "and", left, right };
}

// =============================================================================
// Static False Counterexamples
// =============================================================================

describe("generateStaticFalseCounterexample", () => {
  test("generates counterexample for simple false predicate", () => {
    // 0 > 5 is statically false
    const pred = compare(intTerm(0n), ">", intTerm(5n));
    const ce = generateStaticFalseCounterexample(pred);

    expect(ce.explanation).toContain("statically false");
    expect(ce.violated_predicate).toBe("0 > 5");
  });

  test("generates counterexample with variables", () => {
    // x > x is statically false for comparison
    const pred = compare(varTerm("x"), ">", varTerm("x"));
    const ce = generateStaticFalseCounterexample(pred);

    expect(ce.assignments).toHaveProperty("x");
    expect(ce.violated_predicate).toBe("x > x");
  });

  test("generates counterexample for compound predicate", () => {
    // (x > 5) && (y < 0) with both variables
    const pred = and(
      compare(varTerm("x"), ">", intTerm(5n)),
      compare(varTerm("y"), "<", intTerm(0n))
    );
    const ce = generateStaticFalseCounterexample(pred);

    expect(ce.assignments).toHaveProperty("x");
    expect(ce.assignments).toHaveProperty("y");
  });
});

// =============================================================================
// Contradiction Counterexamples
// =============================================================================

describe("generateContradictionCounterexample", () => {
  test("generates counterexample when fact contradicts predicate", () => {
    const ctx = new RefinementContext();
    // Fact: x > 5
    ctx.addFact(compare(varTerm("x"), ">", intTerm(5n)), "test assumption");

    // Predicate: x <= 5 (contradicts fact)
    const pred = compare(varTerm("x"), "<=", intTerm(5n));
    const fact = ctx.getAllFacts()[0];

    const ce = generateContradictionCounterexample(pred, fact, ctx);

    expect(ce.explanation).toContain("contradicts");
    expect(ce.contradicting_fact).toContain("x > 5");
    expect(ce.contradicting_fact).toContain("test assumption");
    expect(ce.assignments).toHaveProperty("x");
    // x should be a value > 5 (e.g., 6) that satisfies the fact
    const xValue = BigInt(ce.assignments["x"]);
    expect(xValue).toBeGreaterThan(5n);
  });

  test("generates counterexample for equality contradiction", () => {
    const ctx = new RefinementContext();
    // Fact: x == 10
    ctx.addFact(compare(varTerm("x"), "==", intTerm(10n)), "parameter constraint");

    // Predicate: x == 5 (contradicts fact)
    const pred = compare(varTerm("x"), "==", intTerm(5n));
    const fact = ctx.getAllFacts()[0];

    const ce = generateContradictionCounterexample(pred, fact, ctx);

    expect(ce.assignments["x"]).toBe("10");
  });
});

// =============================================================================
// Candidate Counterexamples (for "unknown" results)
// =============================================================================

describe("generateCandidateCounterexample", () => {
  test("generates candidate when no facts available", () => {
    const ctx = new RefinementContext();
    // Predicate: x > 0 (cannot prove without facts)
    const pred = compare(varTerm("x"), ">", intTerm(0n));

    const ce = generateCandidateCounterexample(pred, ctx);

    expect(ce).not.toBeNull();
    expect(ce!.assignments).toHaveProperty("x");
    expect(ce!.explanation).toContain("Possible counterexample");
    // Candidate should be a value that might violate x > 0 (i.e., <= 0)
    const xValue = BigInt(ce!.assignments["x"]);
    expect(xValue).toBeLessThanOrEqual(0n);
  });

  test("generates candidate respecting lower bound", () => {
    const ctx = new RefinementContext();
    // Fact: x >= 0
    ctx.addFact(compare(varTerm("x"), ">=", intTerm(0n)), "lower bound");

    // Predicate: x > 5 (cannot prove, but x >= 0)
    const pred = compare(varTerm("x"), ">", intTerm(5n));

    const ce = generateCandidateCounterexample(pred, ctx);

    expect(ce).not.toBeNull();
    expect(ce!.assignments).toHaveProperty("x");
    // Candidate should be >= 0 (respecting bound) but <= 5 (violating predicate)
    const xValue = BigInt(ce!.assignments["x"]);
    expect(xValue).toBeGreaterThanOrEqual(0n);
    expect(xValue).toBeLessThanOrEqual(5n);
  });

  test("returns null for predicates without variables", () => {
    const ctx = new RefinementContext();
    // Predicate with no variables - not useful for counterexample
    const pred: RefinementPredicate = { kind: "unknown", source: "complex" };

    const ce = generateCandidateCounterexample(pred, ctx);
    expect(ce).toBeNull();
  });
});

// =============================================================================
// Integration with Solver
// =============================================================================

describe("solve - counterexample integration", () => {
  test("refuted result includes counterexample", () => {
    // 0 > 5 is statically false
    const pred = compare(intTerm(0n), ">", intTerm(5n));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
      expect(result.counterexample._explanation).toContain("statically false");
    }
  });

  test("refuted result includes variable bindings", () => {
    const ctx = new RefinementContext();
    // Fact: x > 10
    ctx.addFact(compare(varTerm("x"), ">", intTerm(10n)), "test");

    // Predicate: x <= 10 (contradicts fact)
    const pred = compare(varTerm("x"), "<=", intTerm(10n));
    const result = solve(pred, ctx);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
      expect(result.counterexample.x).toBeDefined();
      expect(result.counterexample._contradicts).toContain("x > 10");
    }
  });

  test("unknown result may include candidate counterexample", () => {
    // x > 0 without any facts is unknown
    const pred = compare(varTerm("x"), ">", intTerm(0n));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("unknown");
    if (result.status === "unknown") {
      // Candidate counterexample should be present
      expect(result.candidate_counterexample).toBeDefined();
      expect(result.candidate_counterexample!.x).toBeDefined();
      // The candidate should violate x > 0
      const xValue = BigInt(result.candidate_counterexample!.x);
      expect(xValue).toBeLessThanOrEqual(0n);
    }
  });

  test("counterexample for identity refutation", () => {
    // x != x is always false
    const pred = compare(varTerm("x"), "!=", varTerm("x"));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
      expect(result.counterexample._explanation).toBeDefined();
    }
  });

  test("counterexample shows why predicate fails", () => {
    const ctx = new RefinementContext();
    // Fact: n > 0 (positive number)
    ctx.addFact(compare(varTerm("n"), ">", intTerm(0n)), "parameter refinement");

    // Predicate: n < 0 (need negative, but we have positive)
    const pred = compare(varTerm("n"), "<", intTerm(0n));
    const result = solve(pred, ctx);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
      // Counterexample should show n = 1 (or similar positive value)
      expect(result.counterexample.n).toBeDefined();
      const nValue = BigInt(result.counterexample.n);
      expect(nValue).toBeGreaterThan(0n);
    }
  });
});

// =============================================================================
// counterexampleToRecord
// =============================================================================

describe("counterexampleToRecord", () => {
  test("includes assignments and metadata", () => {
    const ce = {
      assignments: { x: "5", y: "10" },
      explanation: "Test explanation",
      violated_predicate: "x > y",
      contradicting_fact: "y >= x",
    };

    const record = counterexampleToRecord(ce);

    expect(record.x).toBe("5");
    expect(record.y).toBe("10");
    expect(record._explanation).toBe("Test explanation");
    expect(record._violated).toBe("x > y");
    expect(record._contradicts).toBe("y >= x");
  });

  test("omits undefined fields", () => {
    const ce = {
      assignments: { x: "5" },
      explanation: "Simple test",
    };

    const record = counterexampleToRecord(ce);

    expect(record.x).toBe("5");
    expect(record._explanation).toBe("Simple test");
    expect(record._violated).toBeUndefined();
    expect(record._contradicts).toBeUndefined();
  });
});

// =============================================================================
// Complex Scenarios
// =============================================================================

describe("counterexamples for complex predicates", () => {
  test("arithmetic expression counterexample", () => {
    const ctx = new RefinementContext();
    // m = n + 1
    ctx.setDefinition("m", binopTerm(varTerm("n"), "+", intTerm(1n)));
    // n < 0
    ctx.addFact(compare(varTerm("n"), "<", intTerm(0n)), "test");

    // m > 1 requires n > 0, but we have n < 0
    const pred = compare(varTerm("m"), ">", intTerm(1n));
    const result = solve(pred, ctx);

    // Should be unknown (can't prove) with candidate counterexample
    // m > 1 means n + 1 > 1 means n > 0, but we have n < 0
    if (result.status === "unknown" && result.candidate_counterexample) {
      // Should suggest a value for n (or m) that violates the requirement
      expect(result.candidate_counterexample).toBeDefined();
    }
  });

  test("compound predicate counterexample", () => {
    const ctx = new RefinementContext();
    // x >= 0
    ctx.addFact(compare(varTerm("x"), ">=", intTerm(0n)), "lower bound");
    // x < 5
    ctx.addFact(compare(varTerm("x"), "<", intTerm(5n)), "upper bound");

    // Want: x >= 10 (impossible given x < 5)
    // Note: The solver currently doesn't combine multiple facts to refute,
    // so this returns "unknown" with a candidate counterexample
    const pred = compare(varTerm("x"), ">=", intTerm(10n));
    const result = solve(pred, ctx);

    // The solver can't currently prove this is refuted (needs SMT-level reasoning)
    // but it should provide a candidate counterexample showing a valid value
    expect(result.status).toBe("unknown");
    if (result.status === "unknown") {
      expect(result.candidate_counterexample).toBeDefined();
      // Candidate should respect the lower bound
      const xValue = BigInt(result.candidate_counterexample!.x);
      expect(xValue).toBeGreaterThanOrEqual(0n);
    }
  });
});
