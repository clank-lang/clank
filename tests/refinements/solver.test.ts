/**
 * Tests for the refinement constraint solver.
 */

import { describe, test, expect } from "bun:test";
import { solve, type SolverResult } from "../../src/refinements/solver";
import { RefinementContext } from "../../src/refinements/context";
import type { RefinementPredicate, RefinementTerm } from "../../src/types/types";

// Helper to create terms
function intTerm(value: bigint): RefinementTerm {
  return { kind: "int", value };
}

function varTerm(name: string): RefinementTerm {
  return { kind: "var", name };
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
