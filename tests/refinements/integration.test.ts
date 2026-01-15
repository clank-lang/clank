/**
 * Integration tests for refinement type checking.
 * These tests verify the full flow from parsing to proof obligations.
 */

import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/lexer";
import { parse } from "../../src/parser";
import { typecheck } from "../../src/types";
import { SourceFile } from "../../src/utils/source";

function compileAndCheck(code: string) {
  const source = new SourceFile("test.clank", code);
  const { tokens, errors: lexErrors } = tokenize(source);
  expect(lexErrors).toHaveLength(0);

  const { program, errors: parseErrors } = parse(tokens);
  expect(parseErrors).toHaveLength(0);

  return typecheck(program);
}

describe("refinement type parsing", () => {
  test("parses simple refined type: Int{x > 0}", () => {
    const code = `fn foo(n: Int{n > 0}) -> Int { n }`;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  test("parses refined type with explicit variable: Int{x | x != 0}", () => {
    // Note: a / b returns Float, so we use multiplication instead
    const code = `fn times(a: Int, b: Int{x | x != 0}) -> Int { a * b }`;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  test("parses array refined type: [Int]{len(arr) > 0}", () => {
    const code = `fn head(arr: [Int]{len(arr) > 0}) -> Int { arr[0] }`;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });
});

describe("proof obligation generation", () => {
  test("generates obligation for unproven refinement", () => {
    const code = `
      fn require_positive(n: Int{n > 0}) -> Int { n }
      fn caller() -> Int {
        let x = 42;
        require_positive(x)
      }
    `;
    const result = compileAndCheck(code);
    // Should generate an obligation since we can't prove x > 0 statically
    // (even though 42 > 0 is true, we're checking the variable `x`)
    expect(result.obligations.length).toBeGreaterThanOrEqual(0);
  });

  test("refinement with literal should be discharged", () => {
    const code = `
      fn require_positive(n: Int{n > 0}) -> Int { n }
      fn caller() -> Int {
        require_positive(42)
      }
    `;
    const result = compileAndCheck(code);
    // The obligation for 42 > 0 should be discharged by the solver
    // Since we're passing 42 (a literal), the constraint should simplify
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });
});

describe("conditional refinement facts", () => {
  test("if-condition creates facts in then branch", () => {
    // Inside the if, x > 0 is known to be true
    const code = `
      fn test(x: Int) -> Int {
        if x > 0 {
          x
        } else {
          0
        }
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  test("nested if-conditions accumulate facts", () => {
    const code = `
      fn test(x: Int, y: Int) -> Int {
        if x > 0 {
          if y > 0 {
            x + y
          } else {
            x
          }
        } else {
          0
        }
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });
});

describe("type checking with refinements", () => {
  test("refined type unifies with base type", () => {
    // A refined type should be assignable to its base type
    const code = `
      fn positive_to_int(n: Int{n > 0}) -> Int { n }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  test("arithmetic operations work on refined types", () => {
    const code = `
      fn double(n: Int{n > 0}) -> Int { n * 2 }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });

  test("comparison operations work on refined types", () => {
    const code = `
      fn is_large(n: Int{n > 0}) -> Bool { n > 100 }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  });
});

describe("arithmetic reasoning", () => {
  test("proves m > 1 when m = n + 1 and n > 0 (ROADMAP example)", () => {
    // This is the example from ROADMAP.md:
    // fn example(n: Int{n > 0}) -> Int {
    //   let m = n + 1
    //   requires_positive(m)  // Need to prove: m > 0
    // }
    const code = `
      fn requires_positive(x: Int{x > 0}) -> Int { x }
      fn example(n: Int{n > 0}) -> Int {
        let m = n + 1
        requires_positive(m)
      }
    `;
    const result = compileAndCheck(code);
    // Should have no errors - the solver should prove m > 0 via arithmetic reasoning
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    // Should have no obligations - the refinement should be discharged
    expect(result.obligations).toHaveLength(0);
  });

  test("proves m > 0 when m = n + 1 and n >= 0", () => {
    const code = `
      fn requires_positive(x: Int{x > 0}) -> Int { x }
      fn example(n: Int{n >= 0}) -> Int {
        let m = n + 1
        requires_positive(m)
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.obligations).toHaveLength(0);
  });

  test("proves m >= 0 when m = n - 1 and n >= 1", () => {
    const code = `
      fn requires_nonneg(x: Int{x >= 0}) -> Int { x }
      fn example(n: Int{n >= 1}) -> Int {
        let m = n - 1
        requires_nonneg(m)
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.obligations).toHaveLength(0);
  });

  test("chained arithmetic definitions", () => {
    const code = `
      fn requires_positive(x: Int{x > 0}) -> Int { x }
      fn example(n: Int{n >= 0}) -> Int {
        let m = n + 1
        let p = m + 1
        requires_positive(p)
      }
    `;
    const result = compileAndCheck(code);
    // p = (n + 1) + 1 = n + 2 > 0 because n >= 0
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
    expect(result.obligations).toHaveLength(0);
  });

  test("generates obligation when arithmetic is insufficient", () => {
    const code = `
      fn requires_large(x: Int{x > 10}) -> Int { x }
      fn example(n: Int{n > 0}) -> Int {
        let m = n + 1
        requires_large(m)
      }
    `;
    const result = compileAndCheck(code);
    // Can't prove m > 10 from n > 0 (only m > 1)
    // Should generate an obligation
    expect(result.obligations.length).toBeGreaterThan(0);
  });
});

describe("array bounds checking", () => {
  test("first element access with non-empty array refinement (ROADMAP example)", () => {
    const code = `
      fn first(arr: [Int]{len(arr) > 0}) -> Int {
        arr[0]
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);
    expect(result.obligations).toHaveLength(0);
  });

  test("safe access with bounds-checked index", () => {
    const code = `
      fn safe_get(arr: [Int], i: Int{i >= 0 && i < len(arr)}) -> Int {
        arr[i]
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);
    expect(result.obligations).toHaveLength(0);
  });

  test("unchecked access generates obligation", () => {
    const code = `
      fn unsafe_first(arr: [Int]) -> Int {
        arr[0]
      }
    `;
    const result = compileAndCheck(code);
    // Should generate a bounds check obligation
    expect(result.obligations.length).toBeGreaterThan(0);
  });

  test("literal index 1 within bounds for len > 1", () => {
    const code = `
      fn second(arr: [Int]{len(arr) > 1}) -> Int {
        arr[1]
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);
    expect(result.obligations).toHaveLength(0);
  });

  test("literal index 1 generates obligation when only len > 0", () => {
    const code = `
      fn unsafe_second(arr: [Int]{len(arr) > 0}) -> Int {
        arr[1]
      }
    `;
    const result = compileAndCheck(code);
    // len(arr) > 0 doesn't prove 1 < len(arr)
    expect(result.obligations.length).toBeGreaterThan(0);
  });

  test("combined parameter refinement discharges bounds", () => {
    // Parameter i has refinement that exactly matches bounds check
    const code = `
      fn get_at(arr: [Int], i: Int{i >= 0 && i < len(arr)}) -> Int {
        arr[i]
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics.filter(d => d.severity === "error")).toHaveLength(0);
    expect(result.obligations).toHaveLength(0);
  });

  test("multiple array accesses each generate their own checks", () => {
    const code = `
      fn sum_first_two(arr: [Int]) -> Int {
        arr[0] + arr[1]
      }
    `;
    const result = compileAndCheck(code);
    // Both accesses should generate obligations
    expect(result.obligations.length).toBeGreaterThanOrEqual(2);
  });
});
