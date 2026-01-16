/**
 * Unit tests for hint generation.
 */

import { describe, test, expect } from "bun:test";
import { generateHints, type HintContext } from "../../src/refinements/hints";
import type { RefinementPredicate, RefinementTerm, Type } from "../../src/types/types";
import type { Binding } from "../../src/types/context";
import type { Fact } from "../../src/refinements/context";

// Helper functions to create terms and predicates
function varTerm(name: string): RefinementTerm {
  return { kind: "var", name };
}

function intTerm(value: bigint): RefinementTerm {
  return { kind: "int", value };
}

function compare(
  left: RefinementTerm,
  op: "==" | "!=" | "<" | "<=" | ">" | ">=",
  right: RefinementTerm
): RefinementPredicate {
  return { kind: "compare", op, left, right };
}

function andPred(left: RefinementPredicate, right: RefinementPredicate): RefinementPredicate {
  return { kind: "and", left, right };
}

const TYPE_INT: Type = { kind: "con", name: "Int" };
const TYPE_STRING: Type = { kind: "con", name: "String" };

function makeBinding(type: Type, source: string, mutable = false): Binding {
  return { type, mutable, source: source as Binding["source"] };
}

describe("generateHints", () => {
  test("generates guard hint for simple comparison", () => {
    const goal = compare(varTerm("x"), "!=", intTerm(0n));
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings: new Map(),
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    expect(hints).toContainEqual(
      expect.objectContaining({
        strategy: "guard",
        template: expect.stringContaining("if x != 0"),
        confidence: "high",
      })
    );
  });

  test("generates guard hint for greater-than comparison", () => {
    const goal = compare(varTerm("n"), ">", intTerm(0n));
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings: new Map(),
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    expect(hints).toContainEqual(
      expect.objectContaining({
        strategy: "guard",
        template: expect.stringContaining("if n > 0"),
        confidence: "high",
      })
    );
  });

  test("generates refine_param hint for parameter variables", () => {
    const goal = compare(varTerm("n"), ">", intTerm(0n));
    const bindings = new Map<string, Binding>([
      ["n", makeBinding(TYPE_INT, "parameter")],
    ]);
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings,
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    expect(hints).toContainEqual(
      expect.objectContaining({
        strategy: "refine_param",
        description: expect.stringContaining("n"),
        confidence: "medium",
      })
    );
  });

  test("does not generate refine_param hint for let bindings", () => {
    const goal = compare(varTerm("x"), ">", intTerm(0n));
    const bindings = new Map<string, Binding>([
      ["x", makeBinding(TYPE_INT, "let")],
    ]);
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings,
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    // Should NOT have a refine_param hint since x is not a parameter
    const refineParamHints = hints.filter((h) => h.strategy === "refine_param");
    expect(refineParamHints).toHaveLength(0);
  });

  test("generates assert hint", () => {
    const goal = compare(varTerm("x"), "!=", intTerm(0n));
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings: new Map(),
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    expect(hints).toContainEqual(
      expect.objectContaining({
        strategy: "assert",
        template: expect.stringContaining("assert x != 0"),
        confidence: "medium",
      })
    );
  });

  test("generates info hint listing known facts", () => {
    const goal = compare(varTerm("x"), ">", intTerm(10n));
    const facts: Fact[] = [
      { predicate: compare(varTerm("x"), ">", intTerm(0n)), source: "condition" },
    ];
    const ctx: HintContext = {
      goal,
      facts,
      bindings: new Map(),
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    expect(hints).toContainEqual(
      expect.objectContaining({
        strategy: "info",
        description: expect.stringContaining("x > 0"),
        confidence: "low",
      })
    );
  });

  test("info hint includes variable type", () => {
    const goal = compare(varTerm("n"), ">", intTerm(0n));
    const bindings = new Map<string, Binding>([
      ["n", makeBinding(TYPE_INT, "parameter")],
    ]);
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings,
      definitions: new Map(),
    };

    const hints = generateHints(ctx);
    const infoHint = hints.find((h) => h.strategy === "info");

    expect(infoHint).toBeDefined();
    expect(infoHint!.description).toContain("Int");
  });

  test("info hint includes variable definition", () => {
    const goal = compare(varTerm("m"), ">", intTerm(0n));
    const definitions = new Map<string, RefinementTerm>([
      ["m", { kind: "binop", op: "+", left: varTerm("n"), right: intTerm(1n) }],
    ]);
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings: new Map(),
      definitions,
    };

    const hints = generateHints(ctx);
    const infoHint = hints.find((h) => h.strategy === "info");

    expect(infoHint).toBeDefined();
    expect(infoHint!.description).toContain("n + 1");
  });

  test("generates hints for compound predicate", () => {
    // Goal: i >= 0 && i < len(arr)
    const goal = andPred(
      compare(varTerm("i"), ">=", intTerm(0n)),
      compare(varTerm("i"), "<", { kind: "call", name: "len", args: [varTerm("arr")] })
    );
    const bindings = new Map<string, Binding>([
      ["i", makeBinding(TYPE_INT, "parameter")],
      ["arr", makeBinding({ kind: "array", element: TYPE_INT }, "parameter")],
    ]);
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings,
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    // Should have guard hint
    expect(hints).toContainEqual(
      expect.objectContaining({
        strategy: "guard",
        confidence: "high",
      })
    );

    // Should have refine_param hints for both i and arr
    const refineParamHints = hints.filter((h) => h.strategy === "refine_param");
    expect(refineParamHints.length).toBeGreaterThanOrEqual(1);
  });

  test("extracts variables from nested terms", () => {
    // Goal: (x + y) > 0
    const goal = compare(
      { kind: "binop", op: "+", left: varTerm("x"), right: varTerm("y") },
      ">",
      intTerm(0n)
    );
    const bindings = new Map<string, Binding>([
      ["x", makeBinding(TYPE_INT, "parameter")],
      ["y", makeBinding(TYPE_INT, "parameter")],
    ]);
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings,
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    // Should have refine_param hints for both x and y
    const refineParamHints = hints.filter((h) => h.strategy === "refine_param");
    expect(refineParamHints.length).toBe(2);
  });

  test("handles call terms in predicates", () => {
    // Goal: len(arr) > 0
    const goal = compare(
      { kind: "call", name: "len", args: [varTerm("arr")] },
      ">",
      intTerm(0n)
    );
    const bindings = new Map<string, Binding>([
      ["arr", makeBinding({ kind: "array", element: TYPE_INT }, "parameter")],
    ]);
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings,
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    // Should have refine_param hint for arr
    expect(hints).toContainEqual(
      expect.objectContaining({
        strategy: "refine_param",
        description: expect.stringContaining("arr"),
      })
    );
  });

  test("handles field access in predicates", () => {
    // Goal: obj.count > 0
    const goal = compare(
      { kind: "field", base: varTerm("obj"), field: "count" },
      ">",
      intTerm(0n)
    );
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings: new Map(),
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    // Should have guard hint
    expect(hints).toContainEqual(
      expect.objectContaining({
        strategy: "guard",
        template: expect.stringContaining("obj.count > 0"),
      })
    );
  });

  test("returns multiple hints in expected order", () => {
    const goal = compare(varTerm("n"), ">", intTerm(0n));
    const bindings = new Map<string, Binding>([
      ["n", makeBinding(TYPE_INT, "parameter")],
    ]);
    const ctx: HintContext = {
      goal,
      facts: [],
      bindings,
      definitions: new Map(),
    };

    const hints = generateHints(ctx);

    // Should have at least 4 hints: guard, refine_param, assert, info
    expect(hints.length).toBeGreaterThanOrEqual(4);

    // First should be guard (high confidence)
    expect(hints[0].strategy).toBe("guard");
    expect(hints[0].confidence).toBe("high");

    // Last should be info (low confidence)
    expect(hints[hints.length - 1].strategy).toBe("info");
    expect(hints[hints.length - 1].confidence).toBe("low");
  });
});
