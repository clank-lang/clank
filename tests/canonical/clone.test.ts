/**
 * Tests for AST cloning functionality.
 *
 * These tests verify that the generic deep clone correctly handles:
 * - All AST node types
 * - Nested structures
 * - Special values (bigint, undefined, null)
 * - Edge cases (empty arrays, deeply nested trees)
 * - Node ID generation
 * - Span cloning
 */

import { describe, test, expect } from "bun:test";
import { cloneProgram, cloneNode } from "../../src/canonical/clone";
import { parse } from "../../src/parser";
import { tokenize } from "../../src/lexer";
import { SourceFile } from "../../src/utils/source";
import type { Program } from "../../src/parser/ast";

function parseSource(code: string): Program {
  const source = new SourceFile("<test>", code);
  const { tokens } = tokenize(source);
  const { program } = parse(tokens);
  return program;
}

describe("Clone", () => {
  describe("Node ID generation", () => {
    test("generates new IDs for all nodes", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const cloned = cloneProgram(program);

      // Program ID should be different
      expect(cloned.id).not.toBe(program.id);

      // Declaration ID should be different
      expect(cloned.declarations[0].id).not.toBe(program.declarations[0].id);

      // Nested node IDs should be different
      const origFn = program.declarations[0];
      const clonedFn = cloned.declarations[0];
      if (origFn.kind === "fn" && clonedFn.kind === "fn") {
        expect(clonedFn.body.id).not.toBe(origFn.body.id);
        if (origFn.body.expr && clonedFn.body.expr) {
          expect(clonedFn.body.expr.id).not.toBe(origFn.body.expr.id);
        }
      }
    });

    test("generates unique IDs across multiple clones", () => {
      const program = parseSource(`ƒ test() → Int { 1 }`);
      const clone1 = cloneProgram(program);
      const clone2 = cloneProgram(program);

      // Each clone should have different IDs from each other
      expect(clone1.id).not.toBe(clone2.id);
      expect(clone1.declarations[0].id).not.toBe(clone2.declarations[0].id);
    });

    test("preserves node kind", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const cloned = cloneProgram(program);

      expect(cloned.kind).toBe("program");
      expect(cloned.declarations[0].kind).toBe("fn");
    });
  });

  describe("Span cloning", () => {
    test("clones spans as new objects", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const cloned = cloneProgram(program);

      // Spans should be different objects
      expect(cloned.span).not.toBe(program.span);
      expect(cloned.span.start).not.toBe(program.span.start);
      expect(cloned.span.end).not.toBe(program.span.end);

      // But values should be equal
      expect(cloned.span.file).toBe(program.span.file);
      expect(cloned.span.start.line).toBe(program.span.start.line);
      expect(cloned.span.start.column).toBe(program.span.start.column);
      expect(cloned.span.end.line).toBe(program.span.end.line);
    });

    test("modifying cloned span does not affect original", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const cloned = cloneProgram(program);

      const originalLine = program.span.start.line;
      cloned.span.start.line = 999;

      expect(program.span.start.line).toBe(originalLine);
      expect(cloned.span.start.line).toBe(999);
    });
  });

  describe("Primitive values", () => {
    test("preserves string values", () => {
      const program = parseSource(`ƒ test() → String { "hello" }`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "literal") {
        if (fn.body.expr.value.kind === "string") {
          expect(fn.body.expr.value.value).toBe("hello");
        }
      }
    });

    test("preserves bigint values", () => {
      const program = parseSource(`ƒ test() → Int { 9999999999999999999 }`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "literal") {
        if (fn.body.expr.value.kind === "int") {
          expect(fn.body.expr.value.value).toBe(9999999999999999999n);
        }
      }
    });

    test("preserves boolean values", () => {
      const program = parseSource(`ƒ test() → Bool { true }`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "literal") {
        if (fn.body.expr.value.kind === "bool") {
          expect(fn.body.expr.value.value).toBe(true);
        }
      }
    });

    test("preserves float values", () => {
      const program = parseSource(`ƒ test() → Float { 3.14159 }`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "literal") {
        if (fn.body.expr.value.kind === "float") {
          expect(fn.body.expr.value.value).toBeCloseTo(3.14159);
        }
      }
    });

    test("preserves unit value", () => {
      const program = parseSource(`ƒ test() → () { () }`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "literal") {
        expect(fn.body.expr.value.kind).toBe("unit");
      }
    });
  });

  describe("Array cloning", () => {
    test("clones arrays as new objects", () => {
      const program = parseSource(`ƒ test() → [Int] { [1, 2, 3] }`);
      const cloned = cloneProgram(program);

      const origFn = program.declarations[0];
      const clonedFn = cloned.declarations[0];

      if (origFn.kind === "fn" && clonedFn.kind === "fn") {
        const origExpr = origFn.body.expr;
        const clonedExpr = clonedFn.body.expr;

        if (origExpr?.kind === "array" && clonedExpr?.kind === "array") {
          // Arrays should be different objects
          expect(clonedExpr.elements).not.toBe(origExpr.elements);
          // But same length
          expect(clonedExpr.elements.length).toBe(origExpr.elements.length);
        }
      }
    });

    test("clones empty arrays", () => {
      const program = parseSource(`ƒ test() → [Int] { [] }`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "array") {
        expect(fn.body.expr.elements.length).toBe(0);
      }
    });

    test("modifying cloned array does not affect original", () => {
      const program = parseSource(`ƒ a() → Int { 1 }
ƒ b() → Int { 2 }`);
      const cloned = cloneProgram(program);

      const originalLength = program.declarations.length;
      // Remove a declaration from the clone (for testing purposes)
      cloned.declarations.pop();

      expect(program.declarations.length).toBe(originalLength);
      expect(cloned.declarations.length).toBe(originalLength - 1);
    });
  });

  describe("Nested structure cloning", () => {
    test("deeply nested if expressions", () => {
      const program = parseSource(`ƒ test(x: Int) → Int {
  if x > 0 {
    if x > 10 {
      if x > 100 {
        3
      } else { 2 }
    } else { 1 }
  } else { 0 }
}`);
      const cloned = cloneProgram(program);

      // Verify structure is preserved
      const fn = cloned.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected fn");

      let ifExpr = fn.body.expr;
      expect(ifExpr?.kind).toBe("if");

      // Navigate through nested ifs
      if (ifExpr?.kind === "if" && ifExpr.thenBranch.expr?.kind === "if") {
        const inner = ifExpr.thenBranch.expr;
        expect(inner.kind).toBe("if");
        if (inner.thenBranch.expr?.kind === "if") {
          expect(inner.thenBranch.expr.kind).toBe("if");
        }
      }
    });

    test("nested blocks with statements", () => {
      const program = parseSource(`ƒ test() → Int {
  let a = {
    let b = {
      let c = 1
      c + 1
    }
    b + 1
  }
  a + 1
}`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected fn");

      // Verify statements are cloned
      expect(fn.body.statements.length).toBe(1);
      const letStmt = fn.body.statements[0];
      expect(letStmt.kind).toBe("let");
    });

    test("match expressions with multiple arms", () => {
      const program = parseSource(`ƒ test(x: Int) → Int {
  match x {
    0 -> 0,
    1 -> 1,
    2 -> 2,
    _ -> 99,
  }
}`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected fn");

      const matchExpr = fn.body.expr;
      if (matchExpr?.kind !== "match") throw new Error("Expected match");

      expect(matchExpr.arms.length).toBe(4);

      // Verify each arm is properly cloned
      for (const arm of matchExpr.arms) {
        expect(arm.pattern).toBeDefined();
        expect(arm.body).toBeDefined();
      }
    });
  });

  describe("Optional fields", () => {
    test("preserves undefined optional fields", () => {
      // if without else has undefined elseBranch
      const program = parseSource(`ƒ test(x: Int) → Int {
  if x > 0 { 1 }
}`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected fn");

      const ifExpr = fn.body.expr;
      if (ifExpr?.kind !== "if") throw new Error("Expected if");

      expect(ifExpr.elseBranch).toBeUndefined();
    });

    test("preserves null-ish type annotations", () => {
      // Lambda without type annotation in let binding
      const program = parseSource(`ƒ test() → Int {
  let f = \\x -> x + 1
  f(5)
}`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected fn");

      const letStmt = fn.body.statements[0];
      if (letStmt.kind !== "let") throw new Error("Expected let");

      const lambda = letStmt.init;
      if (lambda?.kind !== "lambda") throw new Error("Expected lambda");

      // Lambda param without type annotation
      expect(lambda.params[0].type).toBeUndefined();
    });

    test("preserves optional mutable flag", () => {
      const program = parseSource(`ƒ test() → Int {
  let x = 1
  let mut y = 2
  x + y
}`);
      const cloned = cloneProgram(program);

      const fn = cloned.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected fn");

      const letX = fn.body.statements[0];
      const letY = fn.body.statements[1];

      if (letX.kind !== "let" || letY.kind !== "let") {
        throw new Error("Expected let statements");
      }

      expect(letX.mutable).toBe(false);
      expect(letY.mutable).toBe(true);
    });
  });

  describe("All expression kinds", () => {
    test("binary expressions", () => {
      const program = parseSource(`ƒ test() → Int { 1 + 2 * 3 }`);
      const cloned = cloneProgram(program);
      expect(cloned.declarations[0].kind).toBe("fn");
    });

    test("unary expressions", () => {
      const program = parseSource(`ƒ test() → Bool { !true }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "unary") {
        expect(fn.body.expr.op).toBe("!");
      }
    });

    test("call expressions", () => {
      const program = parseSource(`ƒ f(x: Int) → Int { x }
ƒ test() → Int { f(42) }`);
      const cloned = cloneProgram(program);
      const testFn = cloned.declarations[1];
      if (testFn.kind === "fn" && testFn.body.expr?.kind === "call") {
        expect(testFn.body.expr.args.length).toBe(1);
      }
    });

    test("index expressions", () => {
      const program = parseSource(`ƒ test(arr: [Int]) → Int { arr[0] }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "index") {
        expect(fn.body.expr.object.kind).toBe("ident");
      }
    });

    test("field expressions", () => {
      const program = parseSource(`rec Point { x: Int, y: Int }
ƒ test(p: Point) → Int { p.x }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[1];
      if (fn.kind === "fn" && fn.body.expr?.kind === "field") {
        expect(fn.body.expr.field).toBe("x");
      }
    });

    test("tuple expressions", () => {
      const program = parseSource(`ƒ test() → (Int, Int) { (1, 2) }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "tuple") {
        expect(fn.body.expr.elements.length).toBe(2);
      }
    });

    test("record expressions", () => {
      const program = parseSource(`rec Point { x: Int, y: Int }
ƒ test() → Point { Point(1, 2) }`);
      const cloned = cloneProgram(program);
      expect(cloned.declarations.length).toBe(2);
    });

    test("lambda expressions", () => {
      const program = parseSource(`ƒ test() → Int { let f = \\x -> x + 1; f(5) }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        const letStmt = fn.body.statements[0];
        if (letStmt.kind === "let" && letStmt.init?.kind === "lambda") {
          expect(letStmt.init.params.length).toBe(1);
          expect(letStmt.init.params[0].name).toBe("x");
        }
      }
    });

    test("propagate expressions", () => {
      const program = parseSource(`ƒ test(x: Option[Int]) → Err[(), Int] { x? }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "propagate") {
        expect(fn.body.expr.expr.kind).toBe("ident");
      }
    });
  });

  describe("All statement kinds", () => {
    test("let statements", () => {
      const program = parseSource(`ƒ test() → Int { let x = 1; x }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.body.statements[0].kind).toBe("let");
      }
    });

    test("assign statements", () => {
      const program = parseSource(`ƒ test() → Int {
  let mut x = 1
  x = 2
  x
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.body.statements[1].kind).toBe("assign");
      }
    });

    test("for statements", () => {
      const program = parseSource(`ƒ test() → () {
  for i in [1, 2, 3] {
    ()
  }
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        const forStmt = fn.body.statements[0];
        if (forStmt.kind === "for") {
          expect(forStmt.pattern.kind).toBe("ident");
        }
      }
    });

    test("while statements", () => {
      const program = parseSource(`ƒ test() → () {
  let mut i = 0
  while i < 10 {
    i = i + 1
  }
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.body.statements[1].kind).toBe("while");
      }
    });

    test("return statements", () => {
      const program = parseSource(`ƒ test() → Int {
  return 42
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.body.statements[0].kind).toBe("return");
      }
    });

    test("break and continue statements", () => {
      const program = parseSource(`ƒ test() → () {
  loop {
    if true { break }
    continue
  }
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        const loopStmt = fn.body.statements[0];
        if (loopStmt.kind === "loop") {
          // First statement in loop should be if with break
          const ifStmt = loopStmt.body.statements[0];
          if (ifStmt.kind === "expr" && ifStmt.expr.kind === "if") {
            const breakStmt = ifStmt.expr.thenBranch.statements[0];
            expect(breakStmt?.kind).toBe("break");
          }
        }
      }
    });

    test("assert statements", () => {
      const program = parseSource(`ƒ test(x: Int) → () {
  assert x > 0
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.body.statements[0].kind).toBe("assert");
      }
    });
  });

  describe("All declaration kinds", () => {
    test("function declarations", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const cloned = cloneProgram(program);
      expect(cloned.declarations[0].kind).toBe("fn");
    });

    test("external function declarations", () => {
      const program = parseSource(`external ƒ now() → Int = "Date.now"`);
      const cloned = cloneProgram(program);
      const decl = cloned.declarations[0];
      if (decl.kind === "externalFn") {
        expect(decl.name).toBe("now");
        expect(decl.jsName).toBe("Date.now");
      }
    });

    test("record declarations", () => {
      const program = parseSource(`rec Point { x: Int, y: Int }`);
      const cloned = cloneProgram(program);
      const decl = cloned.declarations[0];
      if (decl.kind === "rec") {
        expect(decl.name).toBe("Point");
        expect(decl.fields.length).toBe(2);
      }
    });

    test("sum type declarations", () => {
      const program = parseSource(`sum Option[T] { None, Some(T) }`);
      const cloned = cloneProgram(program);
      const decl = cloned.declarations[0];
      if (decl.kind === "sum") {
        expect(decl.name).toBe("Option");
        expect(decl.variants.length).toBe(2);
      }
    });

    test("type alias declarations", () => {
      const program = parseSource(`type MyInt = Int`);
      const cloned = cloneProgram(program);
      const decl = cloned.declarations[0];
      if (decl.kind === "typeAlias") {
        expect(decl.name).toBe("MyInt");
      }
    });
  });

  describe("All pattern kinds", () => {
    test("identifier patterns", () => {
      const program = parseSource(`ƒ test() → Int { let x = 1; x }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        const letStmt = fn.body.statements[0];
        if (letStmt.kind === "let") {
          expect(letStmt.pattern.kind).toBe("ident");
        }
      }
    });

    test("wildcard patterns", () => {
      const program = parseSource(`ƒ test(x: Int) → Int {
  match x {
    _ -> 0,
  }
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "match") {
        expect(fn.body.expr.arms[0].pattern.kind).toBe("wildcard");
      }
    });

    test("literal patterns", () => {
      const program = parseSource(`ƒ test(x: Int) → Int {
  match x {
    0 -> 0,
    _ -> 1,
  }
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.body.expr?.kind === "match") {
        expect(fn.body.expr.arms[0].pattern.kind).toBe("literal");
      }
    });

    test("tuple patterns", () => {
      const program = parseSource(`ƒ test() → Int {
  let (a, b) = (1, 2)
  a + b
}`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        const letStmt = fn.body.statements[0];
        if (letStmt.kind === "let") {
          expect(letStmt.pattern.kind).toBe("tuple");
        }
      }
    });
  });

  describe("Type expressions", () => {
    test("named types", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.returnType.kind).toBe("named");
      }
    });

    test("array types", () => {
      const program = parseSource(`ƒ test() → [Int] { [] }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.returnType.kind).toBe("array");
      }
    });

    test("tuple types", () => {
      const program = parseSource(`ƒ test() → (Int, Bool) { (1, true) }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.returnType.kind).toBe("tuple");
      }
    });

    test("function types", () => {
      // Test function type in parameter (return type syntax is ambiguous)
      const program = parseSource(`ƒ apply(f: (Int) → Int, x: Int) → Int { f(x) }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn") {
        expect(fn.params[0].type.kind).toBe("function");
      }
    });

    test("generic types", () => {
      const program = parseSource(`ƒ test() → Option[Int] { None }`);
      const cloned = cloneProgram(program);
      const fn = cloned.declarations[0];
      if (fn.kind === "fn" && fn.returnType.kind === "named") {
        expect(fn.returnType.args.length).toBe(1);
      }
    });
  });

  describe("Mutation isolation", () => {
    test("modifying cloned expression does not affect original", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const cloned = cloneProgram(program);

      const origFn = program.declarations[0];
      const clonedFn = cloned.declarations[0];

      if (origFn.kind === "fn" && clonedFn.kind === "fn") {
        // Mutate the clone
        if (clonedFn.body.expr?.kind === "literal" && clonedFn.body.expr.value.kind === "int") {
          clonedFn.body.expr.value.value = 999n;
        }

        // Original should be unchanged
        if (origFn.body.expr?.kind === "literal" && origFn.body.expr.value.kind === "int") {
          expect(origFn.body.expr.value.value).toBe(42n);
        }
      }
    });

    test("modifying cloned declaration does not affect original", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const cloned = cloneProgram(program);

      const origFn = program.declarations[0];
      const clonedFn = cloned.declarations[0];

      if (origFn.kind === "fn" && clonedFn.kind === "fn") {
        // Mutate the clone's name (for testing - not normally done)
        (clonedFn as any).name = "modified";

        // Original should be unchanged
        expect(origFn.name).toBe("test");
      }
    });
  });

  describe("cloneNode function", () => {
    test("can clone individual expressions", () => {
      const program = parseSource(`ƒ test() → Int { 1 + 2 }`);
      const fn = program.declarations[0];
      if (fn.kind !== "fn" || !fn.body.expr) throw new Error("Expected fn with expr");

      const cloned = cloneNode(fn.body.expr);

      expect(cloned.id).not.toBe(fn.body.expr.id);
      expect(cloned.kind).toBe(fn.body.expr.kind);
    });

    test("can clone individual statements", () => {
      const program = parseSource(`ƒ test() → Int { let x = 1; x }`);
      const fn = program.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected fn");

      const stmt = fn.body.statements[0];
      const cloned = cloneNode(stmt);

      expect(cloned.id).not.toBe(stmt.id);
      expect(cloned.kind).toBe(stmt.kind);
    });

    test("can clone individual declarations", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);
      const decl = program.declarations[0];
      const cloned = cloneNode(decl);

      expect(cloned.id).not.toBe(decl.id);
      expect(cloned.kind).toBe(decl.kind);
    });
  });
});
