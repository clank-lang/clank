/**
 * Tests for AST JSON serialization and deserialization round-tripping.
 *
 * These tests verify:
 * - Source -> AST -> JSON -> AST produces equivalent AST
 * - JSON with source fragments parses correctly
 * - All major AST node types serialize/deserialize correctly
 */

import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/lexer";
import { parse } from "../../src/parser";
import { typecheck } from "../../src/types";
import { emit } from "../../src/codegen";
import {
  serializeProgram,
  deserializeProgram,
  programToJson,
} from "../../src/ast-json";
import { SourceFile } from "../../src/utils/source";
import type { Program } from "../../src/parser/ast";

// =============================================================================
// Test Helpers
// =============================================================================

function parseSource(source: string): Program {
  const sourceFile = new SourceFile("<test>", source);
  const { tokens, errors: lexErrors } = tokenize(sourceFile);
  if (lexErrors.length > 0) {
    throw new Error(`Lex errors: ${lexErrors.map((e) => e.message).join(", ")}`);
  }
  const { program, errors: parseErrors } = parse(tokens);
  if (parseErrors.length > 0) {
    throw new Error(`Parse errors: ${parseErrors.map((e) => e.message).join(", ")}`);
  }
  return program;
}

function compileProgram(program: Program): { success: boolean; code?: string; errors: string[] } {
  const { diagnostics } = typecheck(program);
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    return {
      success: false,
      errors: errors.map((e) => e.message),
    };
  }
  const { code } = emit(program);
  return { success: true, code, errors: [] };
}

// =============================================================================
// Round-Trip Tests: Source -> JSON -> AST
// =============================================================================

describe("AST-JSON: Source -> JSON -> AST Round-Trip", () => {
  test("round-trips empty program", () => {
    const source = "";
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value?.declarations).toHaveLength(0);
    }
  });

  test("round-trips simple function", () => {
    const source = `fn add(a: Int, b: Int) -> Int { a + b }`;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      // The round-tripped AST should compile successfully
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
      expect(compileResult.code).toContain("function add");
    }
  });

  test("round-trips let binding", () => {
    const source = `fn main() -> Int { let x = 42; x }`;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
      expect(compileResult.code).toContain("const x");
    }
  });

  test("round-trips conditional expression", () => {
    const source = `fn max(a: Int, b: Int) -> Int { if a > b { a } else { b } }`;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("round-trips lambda expression", () => {
    const source = `fn main() -> Int { let double = \\(x: Int) -> x * 2; double(21) }`;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
      expect(compileResult.code).toContain("=>");
    }
  });

  test("round-trips tuple literal", () => {
    const source = `fn pair() -> (Int, Int) { (1, 2) }`;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("round-trips array literal", () => {
    const source = `fn numbers() -> [Int] { [1, 2, 3] }`;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
      expect(compileResult.code).toContain("[1n, 2n, 3n]");
    }
  });

  test("round-trips record type declaration", () => {
    const source = `
      rec Point { x: Int, y: Int }
      fn get_x(p: Point) -> Int { p.x }
    `;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("round-trips type alias", () => {
    const source = `
      type MyInt = Int
      fn double(n: MyInt) -> MyInt { n * 2 }
    `;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("round-trips sum type", () => {
    const source = `
      sum Shape { Circle(Int), Rectangle(Int, Int) }
      fn describe(s: Shape) -> Int {
        match s {
          Circle(r) -> r,
          Rectangle(w, h) -> w + h,
        }
      }
    `;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("round-trips match expression with patterns", () => {
    const source = `
      fn classify(n: Int) -> Int {
        match n {
          0 -> 1,
          x -> x + 1,
        }
      }
    `;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("round-trips Option type usage", () => {
    const source = `fn maybe() -> Option[Int] { Some(42) }`;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
      expect(compileResult.code).toContain("__clank.Some");
    }
  });
});

// =============================================================================
// Hybrid Source Fragment Tests
// =============================================================================

describe("AST-JSON: Source Fragments (Hybrid Input)", () => {
  test("parses function body from source fragment", () => {
    const jsonProgram = JSON.stringify({
      kind: "program",
      declarations: [
        {
          kind: "fn",
          name: "main",
          params: [],
          returnType: { kind: "named", name: "Int" },
          body: { source: "{ 42 }" },
        },
      ],
    });

    const result = deserializeProgram(jsonProgram);
    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
      expect(compileResult.code).toContain("42n");
    }
  });

  test("parses expression from source fragment", () => {
    const jsonProgram = JSON.stringify({
      kind: "program",
      declarations: [
        {
          kind: "fn",
          name: "add",
          params: [
            { name: "a", type: { kind: "named", name: "Int" } },
            { name: "b", type: { kind: "named", name: "Int" } },
          ],
          returnType: { kind: "named", name: "Int" },
          body: {
            kind: "block",
            statements: [],
            expr: { source: "a + b" },
          },
        },
      ],
    });

    const result = deserializeProgram(jsonProgram);
    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("parses type from source fragment", () => {
    const jsonProgram = JSON.stringify({
      kind: "program",
      declarations: [
        {
          kind: "fn",
          name: "identity",
          params: [{ name: "x", type: { source: "Int" } }],
          returnType: { source: "Int" },
          body: {
            kind: "block",
            statements: [],
            expr: { kind: "ident", name: "x" },
          },
        },
      ],
    });

    const result = deserializeProgram(jsonProgram);
    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("reports error for invalid source fragment", () => {
    const jsonProgram = JSON.stringify({
      kind: "program",
      declarations: [
        {
          kind: "fn",
          name: "broken",
          params: [],
          returnType: { kind: "named", name: "Int" },
          body: { source: "{ if then else }" }, // Invalid syntax
        },
      ],
    });

    const result = deserializeProgram(jsonProgram);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// Serialization Format Tests
// =============================================================================

describe("AST-JSON: Serialization Options", () => {
  test("produces valid JSON (compact)", () => {
    const source = `fn main() -> Int { 42 }`;
    const program = parseSource(source);
    const json = serializeProgram(program, { pretty: false });

    // Should be valid JSON
    expect(() => JSON.parse(json)).not.toThrow();
    // Should be compact (no indentation)
    expect(json).not.toContain("\n");
  });

  test("produces valid JSON (pretty)", () => {
    const source = `fn main() -> Int { 42 }`;
    const program = parseSource(source);
    const json = serializeProgram(program, { pretty: true });

    // Should be valid JSON
    expect(() => JSON.parse(json)).not.toThrow();
    // Should be pretty-printed
    expect(json).toContain("\n");
  });

  test("can exclude spans", () => {
    const source = `fn main() -> Int { 42 }`;
    const program = parseSource(source);
    const json = serializeProgram(program, { includeSpans: false });
    const parsed = JSON.parse(json);

    // Function should not have span
    expect(parsed.declarations[0].span).toBeUndefined();
  });

  test("can include spans", () => {
    const source = `fn main() -> Int { 42 }`;
    const program = parseSource(source);
    const json = serializeProgram(program, { includeSpans: true });
    const parsed = JSON.parse(json);

    // Function should have span
    expect(parsed.declarations[0].span).toBeDefined();
  });

  test("programToJson returns object (not string)", () => {
    const source = `fn main() -> Int { 42 }`;
    const program = parseSource(source);
    const obj = programToJson(program);

    expect(typeof obj).toBe("object");
    expect(obj.kind).toBe("program");
    expect(obj.declarations).toBeDefined();
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe("AST-JSON: Error Handling", () => {
  test("reports error for invalid JSON", () => {
    const result = deserializeProgram("not valid json {{{");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });

  test("reports error for missing kind", () => {
    const result = deserializeProgram(JSON.stringify({ declarations: [] }));
    expect(result.ok).toBe(false);
  });

  test("reports error for unknown declaration kind", () => {
    const result = deserializeProgram(
      JSON.stringify({
        kind: "program",
        declarations: [{ kind: "unknown_kind" }],
      })
    );
    expect(result.ok).toBe(false);
  });

  test("reports error with path for nested errors", () => {
    const result = deserializeProgram(
      JSON.stringify({
        kind: "program",
        declarations: [
          {
            kind: "fn",
            name: "test",
            params: [{ name: "x" }], // Missing type
            returnType: { kind: "named", name: "Int" },
            body: { kind: "block", statements: [], expr: { kind: "literal", value: 42 } },
          },
        ],
      })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should have at least one error
      expect(result.errors.length).toBeGreaterThan(0);
      // Error path should start with $ (root)
      expect(result.errors[0].path.startsWith("$")).toBe(true);
    }
  });
});

// =============================================================================
// Complex Program Tests
// =============================================================================

describe("AST-JSON: Complex Programs", () => {
  test("round-trips factorial function", () => {
    const source = `
      fn factorial(n: Int) -> Int {
        if n <= 1 { 1 } else { n * factorial(n - 1) }
      }

      fn main() -> Int {
        factorial(5)
      }
    `;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });

  test("round-trips program with multiple declarations", () => {
    const source = `
      type Count = Int
      rec Counter { value: Count }
      sum State { Running, Stopped }

      fn get_value(c: Counter) -> Count {
        c.value
      }

      fn is_running(s: State) -> Bool {
        match s {
          Running -> true,
          Stopped -> false,
        }
      }
    `;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      expect(result.value.declarations.length).toBeGreaterThanOrEqual(4);
    }
  });

  test("round-trips nested data structures", () => {
    const source = `
      fn nested() -> [[Int]] {
        [[1, 2], [3, 4], [5, 6]]
      }

      fn tuple_of_arrays() -> ([Int], [String]) {
        ([1, 2, 3], ["a", "b", "c"])
      }
    `;
    const original = parseSource(source);
    const json = serializeProgram(original);
    const result = deserializeProgram(json);

    expect(result.ok).toBe(true);
    if (result.ok && result.value) {
      const compileResult = compileProgram(result.value);
      expect(compileResult.success).toBe(true);
    }
  });
});
