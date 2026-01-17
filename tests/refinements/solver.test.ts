/**
 * Tests for the refinement constraint solver.
 */

import { describe, test, expect } from "bun:test";
import { solve } from "../../src/refinements/solver";
import { RefinementContext } from "../../src/refinements/context";
import type { RefinementPredicate, RefinementTerm } from "../../src/types/types";

// Helper to create terms
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

// Helper to create predicates
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

describe("solve - constant predicates", () => {
  test("discharges true", () => {
    const result = solve({ kind: "true" }, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes false", () => {
    const result = solve({ kind: "false" }, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("discharges 5 > 0", () => {
    const pred = compare(intTerm(5n), ">", intTerm(0n));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes 0 > 5", () => {
    const pred = compare(intTerm(0n), ">", intTerm(5n));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("discharges 10 == 10", () => {
    const pred = compare(intTerm(10n), "==", intTerm(10n));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes 10 == 20", () => {
    const pred = compare(intTerm(10n), "==", intTerm(20n));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("discharges 5 != 10", () => {
    const pred = compare(intTerm(5n), "!=", intTerm(10n));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });
});

describe("solve - identity comparisons", () => {
  test("discharges x == x", () => {
    const pred = compare(varTerm("x"), "==", varTerm("x"));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("discharges x <= x", () => {
    const pred = compare(varTerm("x"), "<=", varTerm("x"));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("discharges x >= x", () => {
    const pred = compare(varTerm("x"), ">=", varTerm("x"));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes x < x", () => {
    const pred = compare(varTerm("x"), "<", varTerm("x"));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("refutes x > x", () => {
    const pred = compare(varTerm("x"), ">", varTerm("x"));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("refutes x != x", () => {
    const pred = compare(varTerm("x"), "!=", varTerm("x"));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });
});

describe("solve - logical operators", () => {
  test("discharges true && true", () => {
    const pred = and({ kind: "true" }, { kind: "true" });
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes true && false", () => {
    const pred = and({ kind: "true" }, { kind: "false" });
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("discharges true || false", () => {
    const pred = or({ kind: "true" }, { kind: "false" });
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes false || false", () => {
    const pred = or({ kind: "false" }, { kind: "false" });
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("discharges !false", () => {
    const pred = not({ kind: "false" });
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes !true", () => {
    const pred = not({ kind: "true" });
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });
});

describe("solve - with facts", () => {
  test("discharges x > 0 when x > 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "test");

    const pred = compare(varTerm("x"), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges x > 0 when x > 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(5n)), "test");

    const pred = compare(varTerm("x"), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges x >= 0 when x > 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "test");

    const pred = compare(varTerm("x"), ">=", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges x != 0 when x > 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "test");

    const pred = compare(varTerm("x"), "!=", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("returns unknown for x > 0 without facts", () => {
    const pred = compare(varTerm("x"), ">", intTerm(0n));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("unknown");
  });
});

describe("solve - child context inherits facts", () => {
  test("child context sees parent facts", () => {
    const parent = new RefinementContext();
    parent.addFact(compare(varTerm("x"), ">", intTerm(0n)), "test");

    const child = parent.child();

    const pred = compare(varTerm("x"), ">", intTerm(0n));
    const result = solve(pred, child);
    expect(result.status).toBe("discharged");
  });

  test("parent does not see child facts", () => {
    const parent = new RefinementContext();
    const child = parent.child();
    child.addFact(compare(varTerm("x"), ">", intTerm(0n)), "test");

    const pred = compare(varTerm("x"), ">", intTerm(0n));
    const resultParent = solve(pred, parent);
    const resultChild = solve(pred, child);

    expect(resultParent.status).toBe("unknown");
    expect(resultChild.status).toBe("discharged");
  });
});

// =============================================================================
// Variable Definitions
// =============================================================================

describe("solve - variable definitions", () => {
  test("substitutes variable with its definition", () => {
    const ctx = new RefinementContext();
    // m = 5
    ctx.setDefinition("m", intTerm(5n));

    // m > 0 should become 5 > 0 and discharge
    const pred = compare(varTerm("m"), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("substitutes variable with arithmetic definition", () => {
    const ctx = new RefinementContext();
    // m = n + 1
    ctx.setDefinition("m", binopTerm(varTerm("n"), "+", intTerm(1n)));
    // n > 0
    ctx.addFact(compare(varTerm("n"), ">", intTerm(0n)), "test");

    // m > 1 should become n + 1 > 1, which is true because n > 0
    const pred = compare(varTerm("m"), ">", intTerm(1n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("handles transitive definitions", () => {
    const ctx = new RefinementContext();
    // m = n + 1, p = m + 1
    ctx.setDefinition("m", binopTerm(varTerm("n"), "+", intTerm(1n)));
    ctx.setDefinition("p", binopTerm(varTerm("m"), "+", intTerm(1n)));
    // n >= 0
    ctx.addFact(compare(varTerm("n"), ">=", intTerm(0n)), "test");

    // p > 1 should become n + 2 > 1, which is true because n >= 0
    const pred = compare(varTerm("p"), ">", intTerm(1n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("definitions in child context override parent", () => {
    const parent = new RefinementContext();
    parent.setDefinition("x", intTerm(5n));

    const child = parent.child();
    child.setDefinition("x", intTerm(10n));

    // In child, x should be 10
    const pred = compare(varTerm("x"), ">", intTerm(8n));
    expect(solve(pred, child).status).toBe("discharged");
    // In parent, x should be 5
    expect(solve(pred, parent).status).toBe("refuted");
  });
});

// =============================================================================
// Arithmetic Reasoning
// =============================================================================

describe("solve - arithmetic reasoning", () => {
  test("proves (x + 1) > 0 from x > -1", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(-1n)), "test");

    // x + 1 > 0
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(1n)), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves (x + 1) > 1 from x > 0", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "test");

    // x + 1 > 1
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(1n)), ">", intTerm(1n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves (x + 1) >= 1 from x >= 0", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">=", intTerm(0n)), "test");

    // x + 1 >= 1
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(1n)), ">=", intTerm(1n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves (x - 1) > 0 from x > 1", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(1n)), "test");

    // x - 1 > 0
    const pred = compare(binopTerm(varTerm("x"), "-", intTerm(1n)), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves (x - 1) >= 0 from x >= 1", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">=", intTerm(1n)), "test");

    // x - 1 >= 0
    const pred = compare(binopTerm(varTerm("x"), "-", intTerm(1n)), ">=", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves (n + 1) > 0 from n > 0 (positive to positive)", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("n"), ">", intTerm(0n)), "test");

    // n + 1 > 0
    const pred = compare(binopTerm(varTerm("n"), "+", intTerm(1n)), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves (x + k) > c from x > c - k", () => {
    const ctx = new RefinementContext();
    // x > 5
    ctx.addFact(compare(varTerm("x"), ">", intTerm(5n)), "test");

    // x + 3 > 8 (needs x > 5)
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(3n)), ">", intTerm(8n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("cannot prove (x + 1) > 2 from x > 0", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "test");

    // x + 1 > 2 requires x > 1, but we only have x > 0
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(1n)), ">", intTerm(2n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("unknown");
  });

  test("proves x != 0 from (x + 1) > 1", () => {
    const ctx = new RefinementContext();
    // (x + 1) > 1 implies x > 0
    ctx.addFact(
      compare(binopTerm(varTerm("x"), "+", intTerm(1n)), ">", intTerm(1n)),
      "test"
    );

    // x != 0
    const pred = compare(varTerm("x"), "!=", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves x > -1 from (x + 1) > 0", () => {
    const ctx = new RefinementContext();
    // (x + 1) > 0 implies x > -1
    ctx.addFact(
      compare(binopTerm(varTerm("x"), "+", intTerm(1n)), ">", intTerm(0n)),
      "test"
    );

    // x > -1
    const pred = compare(varTerm("x"), ">", intTerm(-1n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });
});

// =============================================================================
// Combined: Definitions + Arithmetic
// =============================================================================

describe("solve - definitions with arithmetic", () => {
  test("proves m > 0 when m = n + 1 and n > -1", () => {
    const ctx = new RefinementContext();
    ctx.setDefinition("m", binopTerm(varTerm("n"), "+", intTerm(1n)));
    ctx.addFact(compare(varTerm("n"), ">", intTerm(-1n)), "test");

    // m > 0 becomes n + 1 > 0, which is true because n > -1
    const pred = compare(varTerm("m"), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves m > 1 when m = n + 1 and n > 0", () => {
    const ctx = new RefinementContext();
    ctx.setDefinition("m", binopTerm(varTerm("n"), "+", intTerm(1n)));
    ctx.addFact(compare(varTerm("n"), ">", intTerm(0n)), "test");

    // m > 1 becomes n + 1 > 1, which is true because n > 0
    const pred = compare(varTerm("m"), ">", intTerm(1n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("proves requires_positive(m) scenario from ROADMAP", () => {
    // This is the example from ROADMAP.md:
    // fn example(n: Int{n > 0}) -> Int {
    //   let m = n + 1
    //   requires_positive(m)  // Need to prove: m > 0
    // }
    const ctx = new RefinementContext();
    ctx.setDefinition("m", binopTerm(varTerm("n"), "+", intTerm(1n)));
    ctx.addFact(compare(varTerm("n"), ">", intTerm(0n)), "refinement on n");

    // m > 0 should be provable because n > 0 implies n + 1 > 1 > 0
    const pred = compare(varTerm("m"), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });
});

// =============================================================================
// len() Reasoning
// =============================================================================

// Helper to create len(arr) term
function lenTerm(arr: RefinementTerm): RefinementTerm {
  return { kind: "call", name: "len", args: [arr] };
}

describe("solve - len() reasoning", () => {
  test("discharges 0 < len(arr) from len(arr) > 0", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    // Fact: len(arr) > 0
    ctx.addFact(compare(lenTerm(arr), ">", intTerm(0n)), "array refinement");

    // Goal: 0 < len(arr) (same as len(arr) > 0)
    const pred = compare(intTerm(0n), "<", lenTerm(arr));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges len(arr) > 0 from len(arr) > 0 (structural match)", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    ctx.addFact(compare(lenTerm(arr), ">", intTerm(0n)), "array refinement");

    const pred = compare(lenTerm(arr), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges 1 < len(arr) from len(arr) > 1", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    ctx.addFact(compare(lenTerm(arr), ">", intTerm(1n)), "array refinement");

    const pred = compare(intTerm(1n), "<", lenTerm(arr));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges len(arr) >= 1 from len(arr) > 0", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    ctx.addFact(compare(lenTerm(arr), ">", intTerm(0n)), "array refinement");

    // len(arr) > 0 implies len(arr) >= 1
    const pred = compare(lenTerm(arr), ">=", intTerm(1n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges i < len(arr) from fact i < len(arr)", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    const i = varTerm("i");
    ctx.addFact(compare(i, "<", lenTerm(arr)), "parameter refinement");

    const pred = compare(i, "<", lenTerm(arr));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges compound bounds obligation", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    const i = varTerm("i");
    // Facts: i >= 0 && i < len(arr)
    ctx.addFact(compare(i, ">=", intTerm(0n)), "parameter refinement (lower)");
    ctx.addFact(compare(i, "<", lenTerm(arr)), "parameter refinement (upper)");

    // Goal: i >= 0 && i < len(arr)
    const pred = and(
      compare(i, ">=", intTerm(0n)),
      compare(i, "<", lenTerm(arr))
    );
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("unknown when no len facts", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");

    const pred = compare(intTerm(0n), "<", lenTerm(arr));
    const result = solve(pred, ctx);
    expect(result.status).toBe("unknown");
  });

  test("discharges 0 >= 0 (constant)", () => {
    const ctx = new RefinementContext();

    const pred = compare(intTerm(0n), ">=", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges combined constant and len check", () => {
    const ctx = new RefinementContext();
    const arr = varTerm("arr");
    ctx.addFact(compare(lenTerm(arr), ">", intTerm(0n)), "array refinement");

    // Goal: 0 >= 0 && 0 < len(arr)
    const pred = and(
      compare(intTerm(0n), ">=", intTerm(0n)),
      compare(intTerm(0n), "<", lenTerm(arr))
    );
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });
});

// =============================================================================
// De Morgan's Laws and Negation
// =============================================================================

describe("solve - negation of comparisons", () => {
  test("simplifies !(x > 0) to x <= 0", () => {
    // Without facts, !(x > 0) should simplify to x <= 0 and be unknown
    const pred = not(compare(varTerm("x"), ">", intTerm(0n)));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("unknown");
  });

  test("refutes !(x > 0) when x > 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "positive");

    // !(x > 0) → x <= 0, which contradicts x > 0
    const pred = not(compare(varTerm("x"), ">", intTerm(0n)));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("discharges !(x < 0) when x >= 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">=", intTerm(0n)), "non-negative");

    // !(x < 0) → x >= 0, which matches the fact
    const pred = not(compare(varTerm("x"), "<", intTerm(0n)));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges !(x == 0) when x != 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "!=", intTerm(0n)), "nonzero");

    // !(x == 0) → x != 0, which matches the fact
    const pred = not(compare(varTerm("x"), "==", intTerm(0n)));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("simplifies !(x <= 0) to x > 0", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "positive");

    // !(x <= 0) → x > 0, which matches the fact
    const pred = not(compare(varTerm("x"), "<=", intTerm(0n)));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });
});

describe("solve - double negation", () => {
  test("eliminates double negation: !!true → true", () => {
    const pred = not(not({ kind: "true" }));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("eliminates double negation: !!false → false", () => {
    const pred = not(not({ kind: "false" }));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("eliminates double negation: !!(x > 0) with fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "positive");

    // !!(x > 0) → x > 0
    const pred = not(not(compare(varTerm("x"), ">", intTerm(0n))));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });
});

describe("solve - De Morgan's laws", () => {
  test("transforms !(a && b) → !a || !b", () => {
    // !(true && false) → !true || !false → false || true → true
    const pred = not(and({ kind: "true" }, { kind: "false" }));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("transforms !(a || b) → !a && !b", () => {
    // !(false || false) → !false && !false → true && true → true
    const pred = not(or({ kind: "false" }, { kind: "false" }));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes !(a || b) when one branch is true", () => {
    // !(true || false) → !true && !false → false && true → false
    const pred = not(or({ kind: "true" }, { kind: "false" }));
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("discharges !(x > 0 && x < 0) (contradiction)", () => {
    // x > 0 && x < 0 is always false, so !(x > 0 && x < 0) is always true
    const inner = and(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("x"), "<", intTerm(0n))
    );
    const pred = not(inner);
    const ctx = new RefinementContext();

    // The solver now detects that x > 0 && x < 0 is a contradiction
    // So the inner AND simplifies to false, and !(false) = true
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("applies De Morgan to compound predicates with facts", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(5n)), "x > 5");

    // !(x <= 0 || x >= 10) → (x > 0) && (x < 10)
    // With fact x > 5, we need to prove x > 0 && x < 10
    // x > 5 implies x > 0, but doesn't guarantee x < 10
    const pred = not(
      or(
        compare(varTerm("x"), "<=", intTerm(0n)),
        compare(varTerm("x"), ">=", intTerm(10n))
      )
    );
    const result = solve(pred, ctx);
    // Can't prove x < 10 from x > 5
    expect(result.status).toBe("unknown");
  });

  test("discharges De Morgan transformed predicate with sufficient facts", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "x > 0");
    ctx.addFact(compare(varTerm("x"), "<", intTerm(10n)), "x < 10");

    // !(x <= 0 || x >= 10) → (x > 0) && (x < 10)
    const pred = not(
      or(
        compare(varTerm("x"), "<=", intTerm(0n)),
        compare(varTerm("x"), ">=", intTerm(10n))
      )
    );
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });
});

describe("solve - or-predicates", () => {
  test("discharges or when left is true", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "positive");

    // x > 0 || x < 0
    const pred = or(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("x"), "<", intTerm(0n))
    );
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("discharges or when right is true", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "<", intTerm(0n)), "negative");

    // x > 0 || x < 0
    const pred = or(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("x"), "<", intTerm(0n))
    );
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("unknown when neither branch is provable", () => {
    // x > 0 || x < 0 without facts
    const pred = or(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("x"), "<", intTerm(0n))
    );
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("unknown");
  });
});

// =============================================================================
// Solver Refuted Detection (Enhanced Refutation Capabilities)
// =============================================================================

describe("solve - transitive bound refutation", () => {
  test("refutes x < 3 when x > 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(5n)), "x > 5");

    const pred = compare(varTerm("x"), "<", intTerm(3n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes x <= 3 when x > 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(5n)), "x > 5");

    const pred = compare(varTerm("x"), "<=", intTerm(3n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes x >= 10 when x < 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "<", intTerm(5n)), "x < 5");

    const pred = compare(varTerm("x"), ">=", intTerm(10n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes x > 10 when x <= 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "<=", intTerm(5n)), "x <= 5");

    const pred = compare(varTerm("x"), ">", intTerm(10n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes x == 10 when x < 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "<", intTerm(5n)), "x < 5");

    const pred = compare(varTerm("x"), "==", intTerm(10n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes x == 0 when x > 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "x > 0");

    const pred = compare(varTerm("x"), "==", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes x != 5 when x == 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "==", intTerm(5n)), "x == 5");

    const pred = compare(varTerm("x"), "!=", intTerm(5n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("does not refute when bounds don't contradict", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "x > 0");

    // x < 10 doesn't contradict x > 0
    const pred = compare(varTerm("x"), "<", intTerm(10n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("unknown");
  });
});

describe("solve - contradictory AND detection", () => {
  test("refutes x > 0 && x < 0 (same variable, contradictory bounds)", () => {
    const pred = and(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("x"), "<", intTerm(0n))
    );
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("refutes x > 5 && x < 3 (same variable, non-overlapping bounds)", () => {
    const pred = and(
      compare(varTerm("x"), ">", intTerm(5n)),
      compare(varTerm("x"), "<", intTerm(3n))
    );
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("refutes x >= 10 && x <= 5 (same variable, non-overlapping bounds)", () => {
    const pred = and(
      compare(varTerm("x"), ">=", intTerm(10n)),
      compare(varTerm("x"), "<=", intTerm(5n))
    );
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("refutes x == 5 && x != 5 (same variable, direct contradiction)", () => {
    const pred = and(
      compare(varTerm("x"), "==", intTerm(5n)),
      compare(varTerm("x"), "!=", intTerm(5n))
    );
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("refutes x > 0 && x == 0 (same variable, contradictory)", () => {
    const pred = and(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("x"), "==", intTerm(0n))
    );
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("refuted");
  });

  test("does not refute x > 0 && x < 10 (overlapping bounds)", () => {
    const pred = and(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("x"), "<", intTerm(10n))
    );
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("unknown");
  });

  test("does not refute x > 0 && y < 0 (different variables)", () => {
    const pred = and(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("y"), "<", intTerm(0n))
    );
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("unknown");
  });
});

describe("solve - arithmetic expression refutation", () => {
  test("refutes (x + 1) <= 0 when x > 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "x > 0");

    // x > 0 implies x + 1 > 1, so x + 1 <= 0 is impossible
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(1n)), "<=", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes (x + 5) < 3 when x >= 0 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">=", intTerm(0n)), "x >= 0");

    // x >= 0 implies x + 5 >= 5, so x + 5 < 3 is impossible
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(5n)), "<", intTerm(3n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes (x - 1) > 5 when x < 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "<", intTerm(5n)), "x < 5");

    // x < 5 implies x - 1 < 4, so x - 1 > 5 is impossible
    const pred = compare(binopTerm(varTerm("x"), "-", intTerm(1n)), ">", intTerm(5n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("refutes (x - 2) >= 10 when x <= 5 is a fact", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), "<=", intTerm(5n)), "x <= 5");

    // x <= 5 implies x - 2 <= 3, so x - 2 >= 10 is impossible
    const pred = compare(binopTerm(varTerm("x"), "-", intTerm(2n)), ">=", intTerm(10n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("does not refute (x + 1) > 0 when x > 0 is a fact (should prove)", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "x > 0");

    // x > 0 implies x + 1 > 1 > 0, so this should be discharged
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(1n)), ">", intTerm(0n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("discharged");
  });

  test("does not refute (x + 1) > 5 when x > 0 is a fact (unknown)", () => {
    const ctx = new RefinementContext();
    ctx.addFact(compare(varTerm("x"), ">", intTerm(0n)), "x > 0");

    // x > 0 implies x + 1 > 1, but x + 1 > 5 requires x > 4
    const pred = compare(binopTerm(varTerm("x"), "+", intTerm(1n)), ">", intTerm(5n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("unknown");
  });
});

describe("solve - combined refutation scenarios", () => {
  test("refutes complex expression with definition", () => {
    const ctx = new RefinementContext();
    // m = n + 1
    ctx.setDefinition("m", binopTerm(varTerm("n"), "+", intTerm(1n)));
    // n < -1
    ctx.addFact(compare(varTerm("n"), "<", intTerm(-1n)), "n < -1");

    // m > 1 requires n + 1 > 1, i.e., n > 0. But n < -1, so contradiction.
    const pred = compare(varTerm("m"), ">", intTerm(1n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });

  test("discharges !(x > 0 && x < 0) via contradiction detection", () => {
    // x > 0 && x < 0 is always false, so !(x > 0 && x < 0) is always true
    const inner = and(
      compare(varTerm("x"), ">", intTerm(0n)),
      compare(varTerm("x"), "<", intTerm(0n))
    );
    const pred = not(inner);
    const result = solve(pred, new RefinementContext());
    expect(result.status).toBe("discharged");
  });

  test("refutes via transitive reasoning with multiple hops", () => {
    const ctx = new RefinementContext();
    // x > 100
    ctx.addFact(compare(varTerm("x"), ">", intTerm(100n)), "x > 100");

    // x < 50 contradicts x > 100
    const pred = compare(varTerm("x"), "<", intTerm(50n));
    const result = solve(pred, ctx);
    expect(result.status).toBe("refuted");
  });
});
