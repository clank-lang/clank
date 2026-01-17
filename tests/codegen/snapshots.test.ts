/**
 * Snapshot Tests for Code Generation
 *
 * Tests that the generated JavaScript and TypeScript output matches expected snapshots.
 * This ensures output stability and idiomatic code generation.
 */

import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/lexer";
import { parse } from "../../src/parser";
import { emit, emitTS } from "../../src/codegen";
import { SourceFile } from "../../src/utils/source";

// =============================================================================
// Test Helpers
// =============================================================================

interface CompileResult {
  success: boolean;
  code?: string;
  tsCode?: string;
  errors: string[];
}

function compileToJSAndTS(source: string): CompileResult {
  const sourceFile = new SourceFile("<test>", source);

  // Lex
  const { tokens, errors: lexErrors } = tokenize(sourceFile);
  if (lexErrors.length > 0) {
    return {
      success: false,
      errors: lexErrors.map((e) => `Lex error: ${e.message}`),
    };
  }

  // Parse
  const { program, errors: parseErrors } = parse(tokens);
  if (parseErrors.length > 0) {
    return {
      success: false,
      errors: parseErrors.map((e) => `Parse error: ${e.message}`),
    };
  }

  // Generate JS and TS
  const jsResult = emit(program, { includeRuntime: false });
  const tsResult = emitTS(program, { includeRuntime: false });

  return {
    success: true,
    code: jsResult.code,
    tsCode: tsResult.code,
    errors: [],
  };
}

function compileJS(source: string): string {
  const result = compileToJSAndTS(source);
  if (!result.success) {
    throw new Error(`Compilation failed: ${result.errors.join(", ")}`);
  }
  return result.code!;
}

function compileTS(source: string): string {
  const result = compileToJSAndTS(source);
  if (!result.success) {
    throw new Error(`Compilation failed: ${result.errors.join(", ")}`);
  }
  return result.tsCode!;
}

// =============================================================================
// Snapshot Tests - Functions
// =============================================================================

describe("Snapshots: Functions", () => {
  test("simple function - JS", () => {
    const code = compileJS(`
      fn add(a: Int, b: Int) -> Int {
        a + b
      }
    `);
    expect(code).toMatchSnapshot("simple-fn-js");
  });

  test("simple function - TS", () => {
    const code = compileTS(`
      fn add(a: Int, b: Int) -> Int {
        a + b
      }
    `);
    expect(code).toMatchSnapshot("simple-fn-ts");
  });

  test("function with multiple params - TS", () => {
    const code = compileTS(`
      fn combine(x: Int, y: Float, s: Str, b: Bool) -> Str {
        s
      }
    `);
    expect(code).toMatchSnapshot("multi-param-fn-ts");
  });

  test("recursive function - TS", () => {
    const code = compileTS(`
      fn factorial(n: Int) -> Int {
        if n <= 1 { 1 } else { n * factorial(n - 1) }
      }
    `);
    expect(code).toMatchSnapshot("recursive-fn-ts");
  });

  test("function with let bindings - TS", () => {
    const code = compileTS(`
      fn compute(x: Int) -> Int {
        let a = x + 1;
        let b = a * 2;
        a + b
      }
    `);
    expect(code).toMatchSnapshot("fn-with-lets-ts");
  });
});

// =============================================================================
// Snapshot Tests - Types
// =============================================================================

describe("Snapshots: Record Types", () => {
  test("simple record - JS", () => {
    const code = compileJS(`
      rec Point { x: Int, y: Int }
    `);
    expect(code).toMatchSnapshot("simple-record-js");
  });

  test("simple record - TS", () => {
    const code = compileTS(`
      rec Point { x: Int, y: Int }
    `);
    expect(code).toMatchSnapshot("simple-record-ts");
  });

  test("record with multiple field types - TS", () => {
    const code = compileTS(`
      rec Person { name: Str, age: Int, score: Float, active: Bool }
    `);
    expect(code).toMatchSnapshot("complex-record-ts");
  });

  test("generic record - TS", () => {
    const code = compileTS(`
      rec Pair[A, B] { first: A, second: B }
    `);
    expect(code).toMatchSnapshot("generic-record-ts");
  });
});

describe("Snapshots: Sum Types", () => {
  test("simple sum type - JS", () => {
    const code = compileJS(`
      sum Option[T] { Some(T), None }
    `);
    expect(code).toMatchSnapshot("simple-sum-js");
  });

  test("simple sum type - TS", () => {
    const code = compileTS(`
      sum Option[T] { Some(T), None }
    `);
    expect(code).toMatchSnapshot("simple-sum-ts");
  });

  test("sum type with named fields - TS", () => {
    const code = compileTS(`
      sum Shape { Circle(radius: Int), Rectangle(width: Int, height: Int), Point }
    `);
    expect(code).toMatchSnapshot("sum-named-fields-ts");
  });
});

// =============================================================================
// Snapshot Tests - Expressions
// =============================================================================

describe("Snapshots: Expressions", () => {
  test("arithmetic expressions - TS", () => {
    const code = compileTS(`
      fn math(a: Int, b: Int) -> Int {
        let s = a + b;
        let d = a - b;
        let p = a * b;
        let pw = a ^ b;
        s + d + p + pw
      }
    `);
    expect(code).toMatchSnapshot("arithmetic-ts");
  });

  test("comparison expressions - TS", () => {
    const code = compileTS(`
      fn compare(a: Int, b: Int) -> Bool {
        let eq = a == b;
        let neq = a != b;
        let lt = a < b;
        let lte = a <= b;
        let gt = a > b;
        let gte = a >= b;
        eq
      }
    `);
    expect(code).toMatchSnapshot("comparison-ts");
  });

  test("logical expressions - TS", () => {
    const code = compileTS(`
      fn logic(a: Bool, b: Bool) -> Bool {
        let and = a && b;
        let or = a || b;
        let not = !a;
        and || or || not
      }
    `);
    expect(code).toMatchSnapshot("logical-ts");
  });

  test("conditional expression - TS", () => {
    const code = compileTS(`
      fn max(a: Int, b: Int) -> Int {
        if a > b { a } else { b }
      }
    `);
    expect(code).toMatchSnapshot("conditional-ts");
  });

  test("chained conditional - TS", () => {
    const code = compileTS(`
      fn classify(n: Int) -> Str {
        if n < 0 { "negative" }
        else if n == 0 { "zero" }
        else { "positive" }
      }
    `);
    expect(code).toMatchSnapshot("chained-conditional-ts");
  });

  test("lambda expression - TS", () => {
    const code = compileTS(`
      fn apply(x: Int) -> Int {
        let double = \\(n: Int) -> n * 2;
        double(x)
      }
    `);
    expect(code).toMatchSnapshot("lambda-ts");
  });
});

// =============================================================================
// Snapshot Tests - Collections
// =============================================================================

describe("Snapshots: Collections", () => {
  test("array literal - TS", () => {
    const code = compileTS(`
      fn numbers() -> [Int] {
        [1, 2, 3, 4, 5]
      }
    `);
    expect(code).toMatchSnapshot("array-ts");
  });

  test("tuple literal - TS", () => {
    const code = compileTS(`
      fn pair() -> (Int, Str) {
        (42, "hello")
      }
    `);
    expect(code).toMatchSnapshot("tuple-ts");
  });

  test("record literal - TS", () => {
    const code = compileTS(`
      rec Point { x: Int, y: Int }

      fn origin() -> Point {
        Point(0, 0)
      }
    `);
    expect(code).toMatchSnapshot("record-literal-ts");
  });

  test("tuple destructuring - TS", () => {
    const code = compileTS(`
      fn sum_pair(p: (Int, Int)) -> Int {
        let (a, b) = p;
        a + b
      }
    `);
    expect(code).toMatchSnapshot("tuple-destructure-ts");
  });
});

// =============================================================================
// Snapshot Tests - Control Flow
// =============================================================================

describe("Snapshots: Control Flow", () => {
  test("for loop - TS", () => {
    const code = compileTS(`
      fn sum_range() -> Int {
        let mut total: Int = 0;
        for i in [1, 2, 3] {
          total = total + i;
        };
        total
      }
    `);
    expect(code).toMatchSnapshot("for-loop-ts");
  });

  test("while loop - TS", () => {
    const code = compileTS(`
      fn countdown(n: Int) -> Int {
        let mut count: Int = n;
        while count > 0 {
          count = count - 1;
        };
        count
      }
    `);
    expect(code).toMatchSnapshot("while-loop-ts");
  });

  test("return statement - TS", () => {
    const code = compileTS(`
      fn early_return(x: Int) -> Int {
        if x < 0 {
          return 0;
        };
        x
      }
    `);
    expect(code).toMatchSnapshot("return-ts");
  });
});

// =============================================================================
// Snapshot Tests - Pattern Matching
// =============================================================================

describe("Snapshots: Pattern Matching", () => {
  test("simple match - TS", () => {
    const code = compileTS(`
      sum Option[T] { Some(T), None }

      fn unwrap_or(opt: Option[Int], default: Int) -> Int {
        match opt {
          Some(x) -> x,
          None -> default,
        }
      }
    `);
    expect(code).toMatchSnapshot("match-simple-ts");
  });

  test("match with shapes - TS", () => {
    const code = compileTS(`
      sum Shape { Circle(Int), Rectangle(Int, Int) }

      fn area(s: Shape) -> Int {
        match s {
          Circle(r) -> r * r * 3,
          Rectangle(w, h) -> w * h,
        }
      }
    `);
    expect(code).toMatchSnapshot("match-shapes-ts");
  });
});

// =============================================================================
// Snapshot Tests - Complete Programs
// =============================================================================

describe("Snapshots: Complete Programs", () => {
  test("fibonacci - TS", () => {
    const code = compileTS(`
      fn fib(n: Int) -> Int {
        if n <= 1 { n }
        else { fib(n - 1) + fib(n - 2) }
      }

      fn main() -> Int {
        fib(10)
      }
    `);
    expect(code).toMatchSnapshot("fibonacci-ts");
  });

  test("point operations - TS", () => {
    const code = compileTS(`
      rec Point { x: Int, y: Int }

      fn add_points(p1: Point, p2: Point) -> Point {
        Point(p1.x + p2.x, p1.y + p2.y)
      }

      fn distance_sq(p: Point) -> Int {
        p.x * p.x + p.y * p.y
      }

      fn main() -> Int {
        let o = Point(0, 0);
        let pt = Point(3, 4);
        let s = add_points(o, pt);
        distance_sq(s)
      }
    `);
    expect(code).toMatchSnapshot("point-ops-ts");
  });

  test("option utilities - TS", () => {
    const code = compileTS(`
      sum Option[T] { Some(T), None }

      fn is_some(opt: Option[Int]) -> Bool {
        match opt {
          Some(x) -> true,
          None -> false,
        }
      }

      fn map_option(opt: Option[Int]) -> Option[Int] {
        match opt {
          Some(x) -> Some(x * 2),
          None -> None,
        }
      }
    `);
    expect(code).toMatchSnapshot("option-utils-ts");
  });
});

// =============================================================================
// Snapshot Tests - TypeScript Specific Features
// =============================================================================

describe("Snapshots: TypeScript Features", () => {
  test("typed let with annotation - TS", () => {
    const code = compileTS(`
      fn typed_bindings() -> Int {
        let x: Int = 42;
        let s: Str = "hello";
        let b: Bool = true;
        x
      }
    `);
    expect(code).toMatchSnapshot("typed-lets-ts");
  });

  test("generic function - TS", () => {
    const code = compileTS(`
      fn identity[T](x: T) -> T {
        x
      }
    `);
    expect(code).toMatchSnapshot("generic-fn-ts");
  });

  test("array type params - TS", () => {
    const code = compileTS(`
      fn first(arr: [Int]) -> Int {
        arr[0]
      }
    `);
    expect(code).toMatchSnapshot("array-param-ts");
  });

  test("function type param - TS", () => {
    const code = compileTS(`
      fn apply_fn(f: (Int) -> Int, x: Int) -> Int {
        f(x)
      }
    `);
    expect(code).toMatchSnapshot("fn-type-param-ts");
  });
});

// =============================================================================
// Snapshot Tests - Runtime Integration
// =============================================================================

describe("Snapshots: Runtime Integration", () => {
  test("with full runtime - JS", () => {
    const sourceFile = new SourceFile("<test>", `
      fn main() -> Int { 42 }
    `);
    const { tokens } = tokenize(sourceFile);
    const { program } = parse(tokens);
    const result = emit(program, { includeRuntime: true });

    expect(result.code).toContain("const __clank");
    expect(result.code).toContain("Some:");
    expect(result.code).toContain("None:");
    expect(result.code).toContain("match:");
  });

  test("with full runtime - TS", () => {
    const sourceFile = new SourceFile("<test>", `
      fn main() -> Int { 42 }
    `);
    const { tokens } = tokenize(sourceFile);
    const { program } = parse(tokens);
    const result = emitTS(program, { includeRuntime: true });

    expect(result.code).toContain("const __clank: ClankRuntime");
    expect(result.code).toContain("interface ClankRuntime");
    expect(result.code).toContain("type Option<T>");
    expect(result.code).toContain("type Result<T, E>");
  });

  test("minimal runtime - JS", () => {
    const sourceFile = new SourceFile("<test>", `
      fn main() -> Int { 42 }
    `);
    const { tokens } = tokenize(sourceFile);
    const { program } = parse(tokens);
    const result = emit(program, { includeRuntime: true, minimalRuntime: true });

    expect(result.code).toContain("// Clank Runtime (minimal)");
    expect(result.code).not.toContain("abs:");
    expect(result.code).not.toContain("str_len:");
  });
});

// =============================================================================
// Snapshot Tests - Edge Cases
// =============================================================================

describe("Snapshots: Edge Cases", () => {
  test("empty program - JS", () => {
    const code = compileJS("");
    expect(code).toMatchSnapshot("empty-program-js");
  });

  test("empty program - TS", () => {
    const code = compileTS("");
    expect(code).toMatchSnapshot("empty-program-ts");
  });

  test("nested conditionals - TS", () => {
    const code = compileTS(`
      fn nested(a: Int, b: Int, c: Int) -> Int {
        if a > 0 {
          if b > 0 {
            if c > 0 { 1 } else { 2 }
          } else { 3 }
        } else { 4 }
      }
    `);
    expect(code).toMatchSnapshot("nested-if-ts");
  });

  test("deeply nested expressions - TS", () => {
    const code = compileTS(`
      fn deep(x: Int) -> Int {
        ((((x + 1) * 2) - 3) / 1)
      }
    `);
    expect(code).toMatchSnapshot("deep-expr-ts");
  });

  test("unicode syntax - TS", () => {
    const code = compileTS(`
      ƒ increment(x: Int) → Int {
        x + 1
      }
    `);
    expect(code).toMatchSnapshot("unicode-syntax-ts");
  });
});

// =============================================================================
// Contract Tests - Ensure Stable Output Structure
// =============================================================================

describe("Contract: Output Structure", () => {
  test("functions are emitted as function declarations", () => {
    const code = compileTS(`fn foo() -> Int { 42 }`);
    expect(code).toMatch(/^function foo\(/m);
  });

  test("records are emitted as interfaces + constructors", () => {
    const code = compileTS(`rec Point { x: Int, y: Int }`);
    expect(code).toMatch(/^interface Point \{/m);
    expect(code).toMatch(/^function Point\(/m);
  });

  test("sum types are emitted as type unions + constructors", () => {
    const code = compileTS(`sum Color { Red, Green, Blue }`);
    expect(code).toMatch(/^type Color =/m);
    expect(code).toContain("| { tag: \"Red\" }");
    expect(code).toContain("const Red: Color");
  });

  test("bigint literals have n suffix", () => {
    const code = compileJS(`fn main() -> Int { 42 }`);
    expect(code).toContain("42n");
  });

  test("tuples become array literals", () => {
    const code = compileJS(`fn pair() -> (Int, Int) { (1, 2) }`);
    expect(code).toContain("[1n, 2n]");
  });

  test("runtime calls use __clank prefix", () => {
    const code = compileJS(`
      fn foo() -> Option[Int] { Some(42) }
    `);
    expect(code).toContain("__clank.Some");
  });
});

// =============================================================================
// Contract Tests - Reserved Word Handling
// =============================================================================

describe("Contract: Reserved Word Handling", () => {
  test("function named 'default' is mangled", () => {
    const code = compileJS(`fn default(x: Int) -> Int { x }`);
    expect(code).toContain("function default_(x)");
  });

  test("parameter named 'class' is mangled", () => {
    const code = compileJS(`fn foo(class: Int) -> Int { class }`);
    expect(code).toContain("function foo(class_)");
    expect(code).toContain("return class_");
  });

  test("variable named 'this' is mangled", () => {
    const code = compileJS(`
      fn foo() -> Int {
        let this: Int = 42;
        this
      }
    `);
    expect(code).toContain("const this_ = 42n");
    expect(code).toContain("return this_");
  });

  test("record field named 'function' is mangled", () => {
    const code = compileJS(`rec Config { function: Int }`);
    expect(code).toContain("function Config(function_)");
  });

  test("sum variant with reserved word field is mangled", () => {
    const code = compileJS(`sum Result { Success(default: Int), Failure(class: Str) }`);
    expect(code).toContain("function Success(default_)");
    expect(code).toContain("function Failure(class_)");
    // tag strings should NOT be mangled
    expect(code).toContain('tag: "Success"');
    expect(code).toContain('tag: "Failure"');
  });

  test("match binding named 'this' is mangled", () => {
    const code = compileTS(`
      sum Wrapper { Value(Int) }
      fn unwrap(w: Wrapper) -> Int {
        match w {
          Value(this) -> this,
        }
      }
    `);
    expect(code).toContain("Value: (this_) => this_");
  });

  test("multiple reserved words in same function", () => {
    const code = compileJS(`
      fn arguments(eval: Int, class: Int) -> Int {
        let this: Int = eval + class;
        this
      }
    `);
    expect(code).toContain("function arguments_(eval_, class_)");
    expect(code).toContain("const this_ = (eval_ + class_)");
    expect(code).toContain("return this_");
  });

  test("non-reserved words are not mangled", () => {
    const code = compileJS(`fn normal(x: Int, y: Int) -> Int { x + y }`);
    expect(code).toContain("function normal(x, y)");
    expect(code).not.toContain("normal_");
    expect(code).not.toContain("x_");
    expect(code).not.toContain("y_");
  });
});
