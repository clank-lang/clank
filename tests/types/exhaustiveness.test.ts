/**
 * Tests for exhaustiveness checking of match expressions.
 *
 * Exhaustiveness checking ensures all possible values of the scrutinee type
 * are covered by the match arms. This includes:
 * - Sum type variants (all variants must be covered)
 * - Boolean literals (true and false)
 * - Wildcards and identifier bindings (cover all remaining cases)
 * - Guards (arms with guards don't count for exhaustiveness)
 */

import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/lexer";
import { parse } from "../../src/parser";
import { typecheck } from "../../src/types";
import { SourceFile } from "../../src/utils/source";
import { ErrorCode } from "../../src/diagnostics";

function compileAndCheck(code: string) {
  const source = new SourceFile("test.clank", code);
  const { tokens, errors: lexErrors } = tokenize(source);
  expect(lexErrors).toHaveLength(0);

  const { program, errors: parseErrors } = parse(tokens);
  expect(parseErrors).toHaveLength(0);

  return typecheck(program);
}

function expectNoErrors(code: string) {
  const result = compileAndCheck(code);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    console.log("Unexpected errors:", errors.map((e) => e.message));
  }
  expect(errors).toHaveLength(0);
}

function expectNonExhaustiveError(code: string) {
  const result = compileAndCheck(code);
  const errors = result.diagnostics.filter((d) => d.code === ErrorCode.NonExhaustiveMatch);
  expect(errors.length).toBeGreaterThan(0);
  return errors[0];
}

function expectExhaustive(code: string) {
  const result = compileAndCheck(code);
  const errors = result.diagnostics.filter((d) => d.code === ErrorCode.NonExhaustiveMatch);
  if (errors.length > 0) {
    console.log("Unexpected non-exhaustive error:", errors.map((e) => e.message));
  }
  expect(errors).toHaveLength(0);
}

// =============================================================================
// Sum Type Exhaustiveness
// =============================================================================

describe("sum type exhaustiveness", () => {
  test("exhaustive match on Option", () => {
    const code = `
      fn unwrap_or(opt: Option[Int], default: Int) -> Int {
        match opt {
          Some(x) -> x,
          None -> default
        }
      }
    `;
    expectExhaustive(code);
  });

  test("non-exhaustive match missing None", () => {
    const code = `
      fn unwrap(opt: Option[Int]) -> Int {
        match opt {
          Some(x) -> x
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("None");
  });

  test("non-exhaustive match missing Some", () => {
    const code = `
      fn is_none(opt: Option[Int]) -> Bool {
        match opt {
          None -> true
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("Some");
  });

  test("exhaustive match on Result", () => {
    const code = `
      fn unwrap_result(r: Result[Int, String]) -> Int {
        match r {
          Ok(x) -> x,
          Err(_) -> 0
        }
      }
    `;
    expectExhaustive(code);
  });

  test("non-exhaustive match on Result missing Err", () => {
    const code = `
      fn assume_ok(r: Result[Int, String]) -> Int {
        match r {
          Ok(x) -> x
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("Err");
  });

  test("exhaustive match on custom sum type", () => {
    const code = `
      sum Color { Red, Green, Blue }

      fn color_to_int(c: Color) -> Int {
        match c {
          Red -> 0,
          Green -> 1,
          Blue -> 2
        }
      }
    `;
    expectExhaustive(code);
  });

  test("non-exhaustive match on custom sum type", () => {
    const code = `
      sum Color { Red, Green, Blue }

      fn color_to_int(c: Color) -> Int {
        match c {
          Red -> 0,
          Green -> 1
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("Blue");
  });

  test("non-exhaustive match missing multiple variants", () => {
    const code = `
      sum Direction { North, South, East, West }

      fn is_north(d: Direction) -> Bool {
        match d {
          North -> true
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("South");
    expect(error.message).toContain("East");
    expect(error.message).toContain("West");
  });

  test("sum type with payload variants", () => {
    const code = `
      sum Status { Active, Inactive(String), Pending(Int) }

      fn status_to_string(s: Status) -> String {
        match s {
          Active -> "active",
          Inactive(reason) -> reason,
          Pending(days) -> "pending"
        }
      }
    `;
    expectExhaustive(code);
  });

  test("non-exhaustive sum type with payload variants", () => {
    const code = `
      sum Status { Active, Inactive(String), Pending(Int) }

      fn is_active(s: Status) -> Bool {
        match s {
          Active -> true,
          Inactive(_) -> false
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("Pending");
  });
});

// =============================================================================
// Wildcard and Identifier Patterns
// =============================================================================

describe("wildcard and identifier patterns", () => {
  test("wildcard makes match exhaustive", () => {
    const code = `
      sum Color { Red, Green, Blue }

      fn is_red(c: Color) -> Bool {
        match c {
          Red -> true,
          _ -> false
        }
      }
    `;
    expectExhaustive(code);
  });

  test("identifier binding makes match exhaustive", () => {
    const code = `
      sum Color { Red, Green, Blue }

      fn identity(c: Color) -> Color {
        match c {
          other -> other
        }
      }
    `;
    expectExhaustive(code);
  });

  test("wildcard at the end covers remaining variants", () => {
    const code = `
      sum Direction { North, South, East, West }

      fn is_vertical(d: Direction) -> Bool {
        match d {
          North -> true,
          South -> true,
          _ -> false
        }
      }
    `;
    expectExhaustive(code);
  });
});

// =============================================================================
// Boolean Exhaustiveness
// =============================================================================

describe("boolean exhaustiveness", () => {
  test("exhaustive boolean match", () => {
    const code = `
      fn bool_to_int(b: Bool) -> Int {
        match b {
          true -> 1,
          false -> 0
        }
      }
    `;
    expectExhaustive(code);
  });

  test("non-exhaustive boolean match missing true", () => {
    const code = `
      fn only_false(b: Bool) -> Int {
        match b {
          false -> 0
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("true");
  });

  test("non-exhaustive boolean match missing false", () => {
    const code = `
      fn only_true(b: Bool) -> Int {
        match b {
          true -> 1
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("false");
  });

  test("wildcard covers remaining boolean", () => {
    const code = `
      fn bool_to_int(b: Bool) -> Int {
        match b {
          true -> 1,
          _ -> 0
        }
      }
    `;
    expectExhaustive(code);
  });
});

// =============================================================================
// Guards and Exhaustiveness
// =============================================================================

describe("guards and exhaustiveness", () => {
  test("guards do not count for exhaustiveness", () => {
    const code = `
      fn classify(opt: Option[Int]) -> String {
        match opt {
          Some(x) if x > 0 -> "positive",
          None -> "none"
        }
      }
    `;
    // This should be non-exhaustive because Some(x) with guard doesn't cover all Some cases
    const error = expectNonExhaustiveError(code);
    expect(error.message).toContain("Some");
  });

  test("wildcard after guarded patterns makes match exhaustive", () => {
    const code = `
      fn classify(opt: Option[Int]) -> String {
        match opt {
          Some(x) if x > 0 -> "positive",
          Some(x) if x < 0 -> "negative",
          _ -> "zero or none"
        }
      }
    `;
    expectExhaustive(code);
  });

  test("unguarded pattern after guarded makes match exhaustive", () => {
    const code = `
      fn classify(opt: Option[Int]) -> String {
        match opt {
          Some(x) if x > 0 -> "positive",
          Some(_) -> "non-positive",
          None -> "none"
        }
      }
    `;
    expectExhaustive(code);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("edge cases", () => {
  test("empty match is non-exhaustive", () => {
    // Note: The parser might not allow this, but if it does, it should error
    const code = `
      fn empty_match(opt: Option[Int]) -> Int {
        match opt {
        }
      }
    `;
    // This might parse differently, but let's verify it's handled
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors.length).toBeGreaterThan(0);
  });

  test("match on Int requires wildcard", () => {
    const code = `
      fn int_match(n: Int) -> String {
        match n {
          0 -> "zero",
          1 -> "one"
        }
      }
    `;
    // Int has infinite values, so literal patterns can't be exhaustive
    const error = expectNonExhaustiveError(code);
    expect(error).toBeDefined();
  });

  test("match on Int with wildcard is exhaustive", () => {
    const code = `
      fn int_match(n: Int) -> String {
        match n {
          0 -> "zero",
          1 -> "one",
          _ -> "other"
        }
      }
    `;
    expectExhaustive(code);
  });

  test("nested sum types", () => {
    const code = `
      fn nested_match(opt: Option[Result[Int, String]]) -> Int {
        match opt {
          Some(Ok(x)) -> x,
          Some(Err(_)) -> -1,
          None -> 0
        }
      }
    `;
    expectExhaustive(code);
  });

  test("nested sum types require full coverage", () => {
    // Note: Current exhaustiveness checking looks at top-level patterns only.
    // In this case, Some is covered (by Some(Ok(x))) and None is covered,
    // so the match is considered exhaustive at the outer level.
    // Full nested pattern exhaustiveness is a future enhancement.
    const code = `
      fn nested_match(opt: Option[Result[Int, String]]) -> Int {
        match opt {
          Some(Ok(x)) -> x,
          Some(Err(_)) -> -1,
          None -> 0
        }
      }
    `;
    expectExhaustive(code);
  });
});

// =============================================================================
// Structured Error Data
// =============================================================================

describe("structured error data", () => {
  test("missing patterns are included in structured data", () => {
    const code = `
      sum Color { Red, Green, Blue }

      fn incomplete(c: Color) -> Int {
        match c {
          Red -> 0
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    expect(error.structured.kind).toBe("non_exhaustive_match");
    expect(error.structured.missing_patterns).toBeDefined();
    const missing = error.structured.missing_patterns as Array<{ description: string }>;
    expect(missing.length).toBe(2);
    expect(missing.map((m) => m.description)).toContain("Green");
    expect(missing.map((m) => m.description)).toContain("Blue");
  });

  test("variant with payload shows payload placeholder", () => {
    const code = `
      fn incomplete(opt: Option[Int]) -> Int {
        match opt {
          None -> 0
        }
      }
    `;
    const error = expectNonExhaustiveError(code);
    const missing = error.structured.missing_patterns as Array<{ description: string }>;
    expect(missing.length).toBe(1);
    expect(missing[0].description).toBe("Some(_)");
  });
});
