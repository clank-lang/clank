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
