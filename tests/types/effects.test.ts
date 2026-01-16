/**
 * Effect enforcement tests.
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

describe("effect enforcement", () => {
  test("pure function cannot call IO function", () => {
    const code = `
      fn pure_fn() -> Int {
        println("side effect")
        42
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E4001" })
    );
  });

  test("IO function can call IO function", () => {
    // Effect syntax uses + not brackets: IO + ResultType
    const code = `
      fn io_fn() -> IO + Int {
        println("allowed")
        42
      }
    `;
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("pure function can call pure function", () => {
    const code = `
      fn add(a: Int, b: Int) -> Int { a + b }
      fn use_add() -> Int { add(1, 2) }
    `;
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("IO function can call pure function", () => {
    const code = `
      fn add(a: Int, b: Int) -> Int { a + b }
      fn io_fn() -> IO + Int {
        println("hello")
        add(1, 2)
      }
    `;
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("multiple IO calls in IO function are allowed", () => {
    const code = `
      fn multi_io() -> IO + Unit {
        println("first")
        println("second")
        println("third")
      }
    `;
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("nested function calls preserve effect checking", () => {
    const code = `
      fn inner_io() -> IO + Unit { println("inner") }
      fn outer_pure() -> Unit {
        inner_io()
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E4001" })
    );
  });

  test("IO function calling another IO function is allowed", () => {
    const code = `
      fn inner_io() -> IO + Unit { println("inner") }
      fn outer_io() -> IO + Unit {
        inner_io()
      }
    `;
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});

describe("error propagation effects", () => {
  test("propagation in pure function requires Err effect", () => {
    const code = `
      fn fallible() -> Result[Int, String] { Ok(42) }
      fn caller() -> Int {
        fallible()?
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E4002" })
    );
  });

  test("propagation in Err function is allowed", () => {
    // Err effect syntax: Err + ResultType
    const code = `
      fn fallible() -> Result[Int, String] { Ok(42) }
      fn caller() -> Err + Int {
        fallible()?
      }
    `;
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("Option propagation also requires Err effect", () => {
    const code = `
      fn get_opt() -> Option[Int] { Some(42) }
      fn caller() -> Int {
        get_opt()?
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E4002" })
    );
  });

  test("Option propagation in Err function is allowed", () => {
    const code = `
      fn get_opt() -> Option[Int] { Some(42) }
      fn caller() -> Err + Int {
        get_opt()?
      }
    `;
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });
});

describe("combined effects", () => {
  test("IO + Err function can use both effects", () => {
    const code = `
      fn fallible() -> Result[Int, String] { Ok(42) }
      fn combined() -> IO + Err + Int {
        println("starting")
        let x = fallible()?
        println("got value")
        x
      }
    `;
    const result = compileAndCheck(code);
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    expect(errors).toHaveLength(0);
  });

  test("IO function cannot use Err effect", () => {
    const code = `
      fn fallible() -> Result[Int, String] { Ok(42) }
      fn io_only() -> IO + Int {
        println("starting")
        fallible()?
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E4002" })
    );
  });

  test("Err function cannot use IO effect", () => {
    const code = `
      fn err_only() -> Err + Int {
        println("oops")
        42
      }
    `;
    const result = compileAndCheck(code);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: "E4001" })
    );
  });
});

describe("effect type formatting", () => {
  test("function with IO effect shows effect in type", () => {
    const code = `
      fn io_fn() -> IO + Int { 42 }
    `;
    const result = compileAndCheck(code);
    // The function type should include IO
    const fnType = result.functionTypes.get("io_fn");
    expect(fnType).toBeDefined();
    if (fnType && fnType.kind === "fn") {
      expect(fnType.effects.has("IO")).toBe(true);
    }
  });

  test("function with multiple effects tracks all", () => {
    const code = `
      fn multi_effect() -> IO + Err + Int { 42 }
    `;
    const result = compileAndCheck(code);
    const fnType = result.functionTypes.get("multi_effect");
    expect(fnType).toBeDefined();
    if (fnType && fnType.kind === "fn") {
      expect(fnType.effects.has("IO")).toBe(true);
      expect(fnType.effects.has("Err")).toBe(true);
    }
  });
});
