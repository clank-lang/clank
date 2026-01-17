/**
 * Tests for match pattern bindings with generic types.
 *
 * This tests the fix for variant pattern binding with generic types like
 * Result[T, E] and Option[T]. Previously, pattern bindings like Ok(value)
 * would fail because bindPattern only handled 'con' types, not 'app' types.
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

function expectNoErrors(code: string) {
  const result = compileAndCheck(code);
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    console.log("Unexpected errors:", errors.map((e) => e.message));
  }
  expect(errors).toHaveLength(0);
}

function expectError(code: string, errorCode: string) {
  const result = compileAndCheck(code);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: errorCode })
  );
}

describe("match on Result[T, E]", () => {
  test("Ok pattern binding extracts value", () => {
    const code = `
      fn unwrap_or(r: Result[Int, String], fallback: Int) -> Int {
        match r {
          Ok(value) -> value,
          Err(_) -> fallback
        }
      }
    `;
    expectNoErrors(code);
  });

  test("Err pattern binding extracts error", () => {
    const code = `
      fn get_error(r: Result[Int, String]) -> String {
        match r {
          Ok(_) -> "no error",
          Err(msg) -> msg
        }
      }
    `;
    expectNoErrors(code);
  });

  test("both Ok and Err bindings work together", () => {
    const code = `
      fn describe_result(r: Result[Int, String]) -> String {
        match r {
          Ok(n) -> int_to_string(n),
          Err(msg) -> msg
        }
      }
      external fn int_to_string(n: Int) -> String = "String"
    `;
    expectNoErrors(code);
  });

  test("nested function using Result match", () => {
    const code = `
      fn parse_and_double(r: Result[Int, String]) -> Result[Int, String] {
        match r {
          Ok(n) -> Ok(n * 2),
          Err(e) -> Err(e)
        }
      }
    `;
    expectNoErrors(code);
  });

  test("Result with complex types", () => {
    const code = `
      rec Point { x: Int, y: Int }
      fn get_x(r: Result[Point, String]) -> Int {
        match r {
          Ok(p) -> p.x,
          Err(_) -> 0
        }
      }
    `;
    expectNoErrors(code);
  });
});

describe("match on Option[T]", () => {
  test("Some pattern binding extracts value", () => {
    const code = `
      fn get_or_default(opt: Option[String]) -> String {
        match opt {
          Some(s) -> s,
          None -> "default"
        }
      }
    `;
    expectNoErrors(code);
  });

  test("Option with numeric type", () => {
    const code = `
      fn unwrap_option(opt: Option[Int], fallback: Int) -> Int {
        match opt {
          Some(n) -> n,
          None -> fallback
        }
      }
    `;
    expectNoErrors(code);
  });

  test("map over Option", () => {
    const code = `
      fn map_option(opt: Option[Int]) -> Option[Int] {
        match opt {
          Some(n) -> Some(n * 2),
          None -> None
        }
      }
    `;
    expectNoErrors(code);
  });
});

describe("nested generic patterns", () => {
  test("Result containing Option", () => {
    const code = `
      fn process(r: Result[Option[Int], String]) -> Int {
        match r {
          Ok(Some(n)) -> n,
          Ok(None) -> 0,
          Err(_) -> -1
        }
      }
    `;
    expectNoErrors(code);
  });

  test("Option containing Result", () => {
    const code = `
      fn unwrap_nested(opt: Option[Result[Int, String]]) -> Int {
        match opt {
          Some(Ok(n)) -> n,
          Some(Err(_)) -> -1,
          None -> 0
        }
      }
    `;
    expectNoErrors(code);
  });
});

describe("custom sum types remain working", () => {
  test("non-generic sum type pattern binding", () => {
    const code = `
      sum Color { Red, Green, Blue }
      fn to_string(c: Color) -> String {
        match c {
          Red -> "red",
          Green -> "green",
          Blue -> "blue"
        }
      }
    `;
    expectNoErrors(code);
  });

  test("sum type with payloads", () => {
    const code = `
      sum Shape {
        Circle(Float),
        Rectangle(Float, Float)
      }
      fn area(s: Shape) -> Float {
        match s {
          Circle(r) -> 3.14 * r * r,
          Rectangle(w, h) -> w * h
        }
      }
    `;
    expectNoErrors(code);
  });
});

describe("type checking in pattern bodies", () => {
  test("bound variable has correct type", () => {
    // This should fail because we're treating an Int as a String
    const code = `
      fn bad_unwrap(r: Result[Int, String]) -> String {
        match r {
          Ok(value) -> value,
          Err(msg) -> msg
        }
      }
    `;
    expectError(code, "E2001"); // Type mismatch
  });

  test("using bound variable incorrectly", () => {
    // Can't call string method on Int
    const code = `
      fn bad_use(opt: Option[Int]) -> Int {
        match opt {
          Some(n) -> len(n),
          None -> 0
        }
      }
    `;
    expectError(code, "E2001"); // Type mismatch - len expects array/string
  });
});
