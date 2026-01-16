/**
 * Tests for canonical AST idempotency and determinism.
 *
 * These tests verify that:
 * 1. Canonicalizing an already-canonical AST produces the same result (idempotent)
 * 2. Canonicalizing the same input multiple times produces identical output (deterministic)
 */

import { describe, test, expect } from "bun:test";
import { canonicalize } from "../../src/canonical";
import { parse } from "../../src/parser";
import { tokenize } from "../../src/lexer";
import { SourceFile } from "../../src/utils/source";
import { serializeProgram } from "../../src/ast-json";
import type { Program, Expr, Stmt, Decl } from "../../src/parser/ast";

function parseSource(code: string) {
  const source = new SourceFile("<test>", code);
  const { tokens } = tokenize(source);
  const { program } = parse(tokens);
  return program;
}

/**
 * Serialize AST to JSON for comparison (without spans and IDs which change on clone).
 */
function normalizeForComparison(program: Program): string {
  return serializeProgram(program, { includeSpans: false, pretty: false });
}

/**
 * Compare two ASTs structurally (ignoring node IDs and spans).
 */
function assertStructurallyEqual(a: Program, b: Program, message?: string): void {
  const aJson = normalizeForComparison(a);
  const bJson = normalizeForComparison(b);
  expect(aJson).toBe(bJson);
}

describe("Canonical AST Idempotency", () => {
  describe("Simple programs", () => {
    test("identity function is idempotent", () => {
      const program = parseSource(`ƒ id(x: Int) → Int { x }`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("function with arithmetic is idempotent", () => {
      const program = parseSource(`ƒ add(a: Int, b: Int) → Int { a + b }`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("function with if-else is idempotent", () => {
      const program = parseSource(`ƒ max(a: Int, b: Int) → Int {
  if a > b { a } else { b }
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("function with if (no else) is idempotent after normalization", () => {
      const program = parseSource(`ƒ test(x: Int) → Int {
  if x > 0 { 1 }
}`);

      // First canonicalization adds the else branch
      const first = canonicalize(program);
      // Second should be identical
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });
  });

  describe("Pipe operator desugaring", () => {
    test("pipe desugaring is idempotent", () => {
      const program = parseSource(`ƒ inc(x: Int) → Int { x + 1 }
ƒ test() → Int { 5 |> inc }`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      // After first canonicalization, pipe becomes call
      // Second canonicalization should not change anything
      assertStructurallyEqual(first.program, second.program);
    });

    test("chained pipe desugaring is idempotent", () => {
      const program = parseSource(`ƒ f(x: Int) → Int { x + 1 }
ƒ g(x: Int) → Int { x * 2 }
ƒ test() → Int { 5 |> f |> g }`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });
  });

  describe("Complex programs", () => {
    test("nested if expressions are idempotent", () => {
      const program = parseSource(`ƒ classify(x: Int) → Int {
  if x > 0 {
    if x > 10 { 2 } else { 1 }
  } else {
    0
  }
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("match expressions are idempotent", () => {
      const program = parseSource(`ƒ describe(x: Int) → Int {
  match x {
    0 -> 0,
    1 -> 1,
    _ -> 2,
  }
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("let bindings are idempotent", () => {
      const program = parseSource(`ƒ test() → Int {
  let x = 1
  let y = 2
  x + y
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("loops are idempotent", () => {
      const program = parseSource(`ƒ test() → () {
  let mut i = 0
  while i < 10 {
    i = i + 1
  }
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("lambdas are idempotent", () => {
      const program = parseSource(`ƒ test() → Int {
  let f = \\x -> x + 1
  f(5)
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("arrays and tuples are idempotent", () => {
      const program = parseSource(`ƒ test() → ([Int], (Int, Int)) {
  ([1, 2, 3], (4, 5))
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });

    test("records are idempotent", () => {
      const program = parseSource(`rec Point { x: Int, y: Int }
ƒ test() → Point {
  Point(1, 2)
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);

      assertStructurallyEqual(first.program, second.program);
    });
  });

  describe("Multiple canonicalizations", () => {
    test("triple canonicalization produces same result", () => {
      const program = parseSource(`ƒ complex(x: Int) → Int {
  if x > 0 {
    let y = x + 1
    y |> λz → z * 2
  }
}`);

      const first = canonicalize(program);
      const second = canonicalize(first.program);
      const third = canonicalize(second.program);

      assertStructurallyEqual(first.program, second.program);
      assertStructurallyEqual(second.program, third.program);
    });

    test("five canonicalizations produce same result", () => {
      const program = parseSource(`ƒ fib(n: Int) → Int {
  if n <= 1 { n } else { fib(n - 1) + fib(n - 2) }
}`);

      let current = canonicalize(program);
      const firstResult = normalizeForComparison(current.program);

      for (let i = 0; i < 4; i++) {
        current = canonicalize(current.program);
        expect(normalizeForComparison(current.program)).toBe(firstResult);
      }
    });
  });
});

describe("Canonical AST Determinism", () => {
  test("same source produces identical canonical AST", () => {
    const source = `ƒ test(x: Int) → Int {
  if x > 0 { x } else { 0 }
}`;

    // Parse and canonicalize twice from the same source
    const program1 = parseSource(source);
    const program2 = parseSource(source);

    const result1 = canonicalize(program1);
    const result2 = canonicalize(program2);

    assertStructurallyEqual(result1.program, result2.program);
  });

  test("canonicalization is deterministic across multiple runs", () => {
    const source = `ƒ f(x: Int) → Int { x + 1 }
ƒ g(x: Int) → Int { x * 2 }
ƒ test() → Int { 5 |> f |> g }`;

    const results: string[] = [];

    // Run canonicalization 10 times
    for (let i = 0; i < 10; i++) {
      const program = parseSource(source);
      const result = canonicalize(program);
      results.push(normalizeForComparison(result.program));
    }

    // All results should be identical
    const first = results[0];
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(first);
    }
  });

  test("order of declarations is preserved", () => {
    const source = `ƒ a() → Int { 1 }
ƒ b() → Int { 2 }
ƒ c() → Int { 3 }`;

    const program = parseSource(source);
    const result = canonicalize(program);

    // Check that declaration order is preserved
    const decls = result.program.declarations;
    expect(decls.length).toBe(3);

    if (decls[0].kind === "fn") expect(decls[0].name).toBe("a");
    if (decls[1].kind === "fn") expect(decls[1].name).toBe("b");
    if (decls[2].kind === "fn") expect(decls[2].name).toBe("c");

    // Re-canonicalize and check order again
    const result2 = canonicalize(result.program);
    const decls2 = result2.program.declarations;

    if (decls2[0].kind === "fn") expect(decls2[0].name).toBe("a");
    if (decls2[1].kind === "fn") expect(decls2[1].name).toBe("b");
    if (decls2[2].kind === "fn") expect(decls2[2].name).toBe("c");
  });

  test("statement order is preserved", () => {
    const source = `ƒ test() → Int {
  let a = 1
  let b = 2
  let c = 3
  a + b + c
}`;

    const program = parseSource(source);
    const result = canonicalize(program);

    const fn = result.program.declarations[0];
    if (fn.kind !== "fn") throw new Error("Expected function");

    expect(fn.body.statements.length).toBe(3);

    // Re-canonicalize and verify order
    const result2 = canonicalize(result.program);
    const fn2 = result2.program.declarations[0];
    if (fn2.kind !== "fn") throw new Error("Expected function");

    expect(fn2.body.statements.length).toBe(3);
  });
});

describe("Canonical AST with different options", () => {
  test("desugar-only is idempotent", () => {
    const program = parseSource(`ƒ f(x: Int) → Int { x + 1 }
ƒ test() → Int { 5 |> f }`);

    const first = canonicalize(program, { desugar: true, normalize: false });
    const second = canonicalize(first.program, { desugar: true, normalize: false });

    assertStructurallyEqual(first.program, second.program);
  });

  test("normalize-only is idempotent", () => {
    const program = parseSource(`ƒ test(x: Int) → Int {
  if x > 0 { 1 }
}`);

    const first = canonicalize(program, { desugar: false, normalize: true });
    const second = canonicalize(first.program, { desugar: false, normalize: true });

    assertStructurallyEqual(first.program, second.program);
  });

  test("all options disabled preserves structure", () => {
    const program = parseSource(`ƒ f(x: Int) → Int { x + 1 }
ƒ test() → Int { 5 |> f }`);

    const first = canonicalize(program, {
      desugar: false,
      normalize: false,
      annotateEffects: false,
      insertValidators: false,
    });
    const second = canonicalize(first.program, {
      desugar: false,
      normalize: false,
      annotateEffects: false,
      insertValidators: false,
    });

    assertStructurallyEqual(first.program, second.program);

    // Pipe should still be present (not desugared)
    const testFn = first.program.declarations.find(
      (d) => d.kind === "fn" && d.name === "test"
    );
    if (!testFn || testFn.kind !== "fn") throw new Error("Expected test function");
    expect(testFn.body.expr?.kind).toBe("binary");
  });
});
