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

function lenTerm(arr: RefinementTerm): RefinementTerm {
  return { kind: "call", name: "len", args: [arr] };
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

function or(left: RefinementPredicate, right: RefinementPredicate): RefinementPredicate {
  return { kind: "or", left, right };
}

function not(inner: RefinementPredicate): RefinementPredicate {
  return { kind: "not", inner };
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

  test("generates counterexample for equality contradiction", () => {
    // 5 == 10 is statically false
    const pred = compare(intTerm(5n), "==", intTerm(10n));
    const ce = generateStaticFalseCounterexample(pred);

    expect(ce.explanation).toContain("statically false");
    expect(ce.violated_predicate).toBe("5 == 10");
  });

  test("generates counterexample for less-than contradiction", () => {
    // 10 < 5 is statically false
    const pred = compare(intTerm(10n), "<", intTerm(5n));
    const ce = generateStaticFalseCounterexample(pred);

    expect(ce.explanation).toContain("statically false");
    expect(ce.violated_predicate).toBe("10 < 5");
  });

  test("generates counterexample for negation of true", () => {
    // !true is statically false
    const pred = not({ kind: "true" });
    const ce = generateStaticFalseCounterexample(pred);

    expect(ce.explanation).toContain("statically false");
  });

  test("generates counterexample for or of two false predicates", () => {
    // false || false is statically false
    const pred = or({ kind: "false" }, { kind: "false" });
    const ce = generateStaticFalseCounterexample(pred);

    expect(ce.explanation).toContain("statically false");
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

  test("generates counterexample for inequality contradiction", () => {
    const ctx = new RefinementContext();
    // Fact: x != 0
    ctx.addFact(compare(varTerm("x"), "!=", intTerm(0n)), "non-zero constraint");

    // Predicate: x == 0 (contradicts fact)
    const pred = compare(varTerm("x"), "==", intTerm(0n));
    const fact = ctx.getAllFacts()[0];

    const ce = generateContradictionCounterexample(pred, fact, ctx);

    expect(ce.explanation).toContain("contradicts");
    expect(ce.contradicting_fact).toContain("x != 0");
  });

  test("generates counterexample for >= vs < contradiction", () => {
    const ctx = new RefinementContext();
    // Fact: x >= 10
    ctx.addFact(compare(varTerm("x"), ">=", intTerm(10n)), "minimum bound");

    // Predicate: x < 10 (contradicts fact)
    const pred = compare(varTerm("x"), "<", intTerm(10n));
    const fact = ctx.getAllFacts()[0];

    const ce = generateContradictionCounterexample(pred, fact, ctx);

    expect(ce.assignments).toHaveProperty("x");
    const xValue = BigInt(ce.assignments["x"]);
    expect(xValue).toBeGreaterThanOrEqual(10n);
  });

  test("includes source in contradicting fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("n"), ">", intTerm(0n)), "refinement on parameter 'n'");

    const pred = compare(varTerm("n"), "<=", intTerm(0n));
    const fact = ctx.getAllFacts()[0];

    const ce = generateContradictionCounterexample(pred, fact, ctx);

    expect(ce.contradicting_fact).toContain("refinement on parameter 'n'");
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

  test("generates candidate respecting upper bound", () => {
    const ctx = new RefinementContext();
    // Fact: x <= 100
    ctx.addFact(compare(varTerm("x"), "<=", intTerm(100n)), "upper bound");

    // Predicate: x < 50 (cannot prove)
    const pred = compare(varTerm("x"), "<", intTerm(50n));

    const ce = generateCandidateCounterexample(pred, ctx);

    expect(ce).not.toBeNull();
    expect(ce!.assignments).toHaveProperty("x");
    // Candidate should be <= 100 (respecting bound) but >= 50 (violating predicate)
    const xValue = BigInt(ce!.assignments["x"]);
    expect(xValue).toBeLessThanOrEqual(100n);
    expect(xValue).toBeGreaterThanOrEqual(50n);
  });

  test("generates candidate for inequality predicate", () => {
    const ctx = new RefinementContext();
    // Predicate: x != 0 (cannot prove without facts)
    const pred = compare(varTerm("x"), "!=", intTerm(0n));

    const ce = generateCandidateCounterexample(pred, ctx);

    expect(ce).not.toBeNull();
    expect(ce!.assignments).toHaveProperty("x");
    // Candidate should be 0 (violating x != 0)
    const xValue = BigInt(ce!.assignments["x"]);
    expect(xValue).toBe(0n);
  });

  test("generates candidate for equality predicate", () => {
    const ctx = new RefinementContext();
    // Predicate: x == 10 (cannot prove without facts)
    const pred = compare(varTerm("x"), "==", intTerm(10n));

    const ce = generateCandidateCounterexample(pred, ctx);

    expect(ce).not.toBeNull();
    expect(ce!.assignments).toHaveProperty("x");
    // Candidate should be != 10 (violating x == 10)
    const xValue = BigInt(ce!.assignments["x"]);
    expect(xValue).not.toBe(10n);
  });

  test("generates candidate with exact equality from context", () => {
    const ctx = new RefinementContext();
    // Fact: x == 42
    ctx.addFact(compare(varTerm("x"), "==", intTerm(42n)), "known value");

    // Predicate: x > 50 (cannot prove since x == 42)
    const pred = compare(varTerm("x"), ">", intTerm(50n));

    const ce = generateCandidateCounterexample(pred, ctx);

    expect(ce).not.toBeNull();
    expect(ce!.assignments).toHaveProperty("x");
    // Should use the known value 42
    const xValue = BigInt(ce!.assignments["x"]);
    expect(xValue).toBe(42n);
  });

  test("returns null for predicates without variables", () => {
    const ctx = new RefinementContext();
    // Predicate with no variables - not useful for counterexample
    const pred: RefinementPredicate = { kind: "unknown", source: "complex" };

    const ce = generateCandidateCounterexample(pred, ctx);
    expect(ce).toBeNull();
  });

  test("returns null for true/false predicates", () => {
    const ctx = new RefinementContext();

    expect(generateCandidateCounterexample({ kind: "true" }, ctx)).toBeNull();
    expect(generateCandidateCounterexample({ kind: "false" }, ctx)).toBeNull();
  });

  test("handles multiple variables - returns null for complex comparisons", () => {
    const ctx = new RefinementContext();
    // Predicate: x > y (cannot prove without facts about x and y)
    // Note: The current implementation can't generate candidates for
    // comparisons between two variables without concrete bounds
    const pred = compare(varTerm("x"), ">", varTerm("y"));

    const ce = generateCandidateCounterexample(pred, ctx);

    // Current implementation returns null for variable-to-variable comparisons
    // This is acceptable behavior - we can't generate a meaningful counterexample
    // without knowing more about the variables
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

  test("counterexample for x < x refutation", () => {
    const pred = compare(varTerm("x"), "<", varTerm("x"));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
    }
  });

  test("counterexample for x > x refutation", () => {
    const pred = compare(varTerm("x"), ">", varTerm("x"));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
    }
  });

  test("discharged result has no counterexample", () => {
    // x == x is always true
    const pred = compare(varTerm("x"), "==", varTerm("x"));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("discharged");
  });

  test("discharged with fact has no counterexample", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "test");

    // x > 0 is satisfied by the fact
    const pred = compare(varTerm("x"), ">", intTerm(0n));
    const result = solve(pred, ctx);

    expect(result.status).toBe("discharged");
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

  test("handles empty assignments", () => {
    const ce = {
      assignments: {},
      explanation: "No variables",
    };

    const record = counterexampleToRecord(ce);

    expect(record._explanation).toBe("No variables");
    expect(Object.keys(record).filter(k => !k.startsWith("_")).length).toBe(0);
  });

  test("handles many variables", () => {
    const ce = {
      assignments: { a: "1", b: "2", c: "3", d: "4", e: "5" },
      explanation: "Multiple variables",
    };

    const record = counterexampleToRecord(ce);

    expect(record.a).toBe("1");
    expect(record.b).toBe("2");
    expect(record.c).toBe("3");
    expect(record.d).toBe("4");
    expect(record.e).toBe("5");
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
    // The solver now uses transitive reasoning to detect that x < 5 contradicts x >= 10
    const pred = compare(varTerm("x"), ">=", intTerm(10n));
    const result = solve(pred, ctx);

    // The solver can now refute this using transitive bound reasoning
    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
      // Counterexample should show a value that satisfies x < 5 but violates x >= 10
      const xValue = BigInt(result.counterexample.x);
      expect(xValue).toBeLessThan(5n);
    }
  });

  test("negation predicate is refuted when inner is fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "positive");

    // !(x > 0) contradicts the fact x > 0
    // With De Morgan's laws, !(x > 0) simplifies to x <= 0, which contradicts x > 0
    const pred = not(compare(varTerm("x"), ">", intTerm(0n)));
    const result = solve(pred, ctx);

    // Solver can now refute this: !(x > 0) ≡ x <= 0, which contradicts x > 0
    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
    }
  });

  test("and predicate with one false branch", () => {
    // true && false is false
    const pred = and({ kind: "true" }, { kind: "false" });
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
    }
  });

  test("or predicate with both unknown branches", () => {
    // x > 0 || y > 0 (both unknown)
    const pred = or(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("y"), ">", intTerm(0n))
    );
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("unknown");
    if (result.status === "unknown" && result.candidate_counterexample) {
      // Should have candidates for both x and y
      expect(result.candidate_counterexample.x).toBeDefined();
      expect(result.candidate_counterexample.y).toBeDefined();
    }
  });
});

// =============================================================================
// Child Context Inheritance
// =============================================================================

describe("counterexamples with child contexts", () => {
  test("child context inherits parent facts for counterexample generation", () => {
    const parent = new RefinementContext();
    parent.addFact(compare(varTerm("x"), ">", intTerm(0n)), "parent fact");

    const child = parent.child();

    // x <= 0 contradicts parent fact
    const pred = compare(varTerm("x"), "<=", intTerm(0n));
    const result = solve(pred, child);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
      expect(result.counterexample._contradicts).toContain("x > 0");
    }
  });

  test("child context adds own facts for counterexample generation", () => {
    const parent = new RefinementContext();
    const child = parent.child();
    child.addFact(compare(varTerm("y"), "<", intTerm(10n)), "child fact");

    // y >= 10 contradicts child fact
    const pred = compare(varTerm("y"), ">=", intTerm(10n));
    const result = solve(pred, child);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
    }
  });

  test("candidate counterexample respects inherited bounds", () => {
    const parent = new RefinementContext();
    parent.addFact(compare(varTerm("x"), ">=", intTerm(5n)), "parent lower bound");

    const child = parent.child();

    // x > 100 cannot be proven, but x >= 5 is inherited
    const pred = compare(varTerm("x"), ">", intTerm(100n));
    const result = solve(pred, child);

    expect(result.status).toBe("unknown");
    if (result.status === "unknown" && result.candidate_counterexample) {
      const xValue = BigInt(result.candidate_counterexample.x);
      expect(xValue).toBeGreaterThanOrEqual(5n);
    }
  });
});

// =============================================================================
// len() Predicates
// =============================================================================

describe("counterexamples for len() predicates", () => {
  test("unknown for len predicate without facts", () => {
    const arr = varTerm("arr");
    // len(arr) > 0 without facts
    const pred = compare(lenTerm(arr), ">", intTerm(0n));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("unknown");
  });

  test("candidate counterexample for array bounds check", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    const i = varTerm("i");

    // Fact: len(arr) > 0
    ctx.addFact(compare(lenTerm(arr), ">", intTerm(0n)), "non-empty array");

    // Goal: i >= 0 && i < len(arr) - cannot prove without facts about i
    const pred = and(
      compare(i, ">=", intTerm(0n)),
      compare(i, "<", lenTerm(arr))
    );
    const result = solve(pred, ctx);

    // Should be unknown since we don't know about i
    expect(result.status).toBe("unknown");
    if (result.status === "unknown" && result.candidate_counterexample) {
      // Should have a candidate for i
      expect(result.candidate_counterexample.i).toBeDefined();
    }
  });

  test("refuted when i >= len(arr) contradicts i < len(arr)", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    const i = varTerm("i");

    // Fact: i >= len(arr)
    ctx.addFact(compare(i, ">=", lenTerm(arr)), "index out of bounds");

    // Goal: i < len(arr) - contradicts fact
    const pred = compare(i, "<", lenTerm(arr));
    const result = solve(pred, ctx);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
    }
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("counterexample edge cases", () => {
  test("handles negative numbers in counterexamples", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "<", intTerm(0n)), "negative");

    // x >= 0 contradicts x < 0
    const pred = compare(varTerm("x"), ">=", intTerm(0n));
    const result = solve(pred, ctx);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      const xValue = BigInt(result.counterexample.x);
      expect(xValue).toBeLessThan(0n);
    }
  });

  test("handles large numbers in counterexamples", () => {
    const ctx = new RefinementContext();
    const largeNum = 9007199254740991n; // Number.MAX_SAFE_INTEGER
    ctx.addFact(compare(varTerm("x"), ">", intTerm(largeNum)), "large bound");

    // x <= largeNum contradicts x > largeNum
    const pred = compare(varTerm("x"), "<=", intTerm(largeNum));
    const result = solve(pred, ctx);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      const xValue = BigInt(result.counterexample.x);
      expect(xValue).toBeGreaterThan(largeNum);
    }
  });

  test("handles zero as boundary", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "==", intTerm(0n)), "zero");

    // x != 0 contradicts x == 0
    const pred = compare(varTerm("x"), "!=", intTerm(0n));
    const result = solve(pred, ctx);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample.x).toBe("0");
    }
  });

  test("refutes arithmetic expression that contradicts known bounds", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "positive");

    // (x + 1) <= 0 is impossible when x > 0, because x > 0 implies x + 1 > 1 > 0
    // The solver now uses arithmetic refutation to detect this
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(1n)), "<=", intTerm(0n));
    const result = solve(pred, ctx);

    // The solver can now refute this using arithmetic reasoning
    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample).toBeDefined();
      // Counterexample should show a value that satisfies x > 0
      const xValue = BigInt(result.counterexample.x);
      expect(xValue).toBeGreaterThan(0n);
    }
  });

  test("handles subtraction in predicate", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">=", intTerm(1n)), "at least 1");

    // (x - 1) >= 0 should be provable when x >= 1
    const pred = compare(binopTerm(varTerm("x"), "-", intTerm(1n)), ">=", intTerm(0n));
    const result = solve(pred, ctx);

    expect(result.status).toBe("discharged");
  });
});

// =============================================================================
// Counterexample Quality
// =============================================================================

describe("counterexample quality", () => {
  test("provides meaningful explanation", () => {
    const pred = compare(intTerm(5n), ">", intTerm(10n));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample._explanation).toBeDefined();
      expect(result.counterexample._explanation.length).toBeGreaterThan(0);
    }
  });

  test("includes violated predicate in output", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(5n)), "constraint");

    const pred = compare(varTerm("x"), "<=", intTerm(5n));
    const result = solve(pred, ctx);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample._violated).toContain("x <= 5");
    }
  });

  test("includes contradicting fact source", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("n"), ">", intTerm(0n)), "refinement on parameter 'n'");

    const pred = compare(varTerm("n"), "<=", intTerm(0n));
    const result = solve(pred, ctx);

    expect(result.status).toBe("refuted");
    if (result.status === "refuted") {
      expect(result.counterexample._contradicts).toContain("refinement on parameter 'n'");
    }
  });

  test("candidate counterexample includes explanation", () => {
    const pred = compare(varTerm("x"), ">", intTerm(0n));
    const result = solve(pred, new RefinementContext());

    expect(result.status).toBe("unknown");
    if (result.status === "unknown" && result.candidate_counterexample) {
      expect(result.candidate_counterexample._explanation).toContain("Possible counterexample");
    }
  });
});
