/**
 * Tests for AST desugaring transformations.
 *
 * Note: Unicode operator normalization (≠ → !=, ≥ → >=, etc.) is already
 * handled by the parser. The desugar phase handles additional transformations
 * like pipe operator expansion.
 */

import { describe, test, expect } from "bun:test";
import { desugar } from "../../src/canonical/desugar";
import { parse } from "../../src/parser";
import { tokenize } from "../../src/lexer";
import { SourceFile } from "../../src/utils/source";

function parseSource(code: string) {
  const source = new SourceFile("<test>", code);
  const { tokens } = tokenize(source);
  const { program } = parse(tokens);
  return program;
}

describe("Desugar", () => {
  describe("Operator preservation", () => {
    // Unicode operators are normalized by the parser, desugaring preserves them

    test("preserves comparison operators", () => {
      const program = parseSource(`ƒ test() → Bool { 1 >= 2 }`);
      const desugared = desugar(program);

      const fn = desugared.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const body = fn.body;
      if (!body.expr || body.expr.kind !== "binary") {
        throw new Error("Expected binary expression");
      }

      expect(body.expr.op).toBe(">=");
    });

    test("preserves equality operators", () => {
      const program = parseSource(`ƒ test() → Bool { 1 != 2 }`);
      const desugared = desugar(program);

      const fn = desugared.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const body = fn.body;
      if (!body.expr || body.expr.kind !== "binary") {
        throw new Error("Expected binary expression");
      }

      expect(body.expr.op).toBe("!=");
    });

    test("preserves logical operators", () => {
      const program = parseSource(`ƒ test() → Bool { true && false }`);
      const desugared = desugar(program);

      const fn = desugared.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const body = fn.body;
      if (!body.expr || body.expr.kind !== "binary") {
        throw new Error("Expected binary expression");
      }

      expect(body.expr.op).toBe("&&");
    });

    test("preserves unary operators", () => {
      const program = parseSource(`ƒ test() → Bool { !true }`);
      const desugared = desugar(program);

      const fn = desugared.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const body = fn.body;
      if (!body.expr || body.expr.kind !== "unary") {
        throw new Error("Expected unary expression");
      }

      expect(body.expr.op).toBe("!");
    });
  });

  describe("Pipe operator expansion", () => {
    test("converts x |> f to f(x)", () => {
      const program = parseSource(`ƒ double(x: Int) → Int { x * 2 }
ƒ test() → Int { 5 |> double }`);
      const desugared = desugar(program);

      // Find the test function
      const testFn = desugared.declarations.find(
        (d) => d.kind === "fn" && d.name === "test"
      );
      if (!testFn || testFn.kind !== "fn") {
        throw new Error("Expected test function");
      }

      const body = testFn.body;
      if (!body.expr || body.expr.kind !== "call") {
        throw new Error("Expected call expression after pipe desugaring");
      }

      // The callee should be 'double'
      expect(body.expr.callee.kind).toBe("ident");
      if (body.expr.callee.kind === "ident") {
        expect(body.expr.callee.name).toBe("double");
      }

      // The argument should be 5
      expect(body.expr.args.length).toBe(1);
      expect(body.expr.args[0].kind).toBe("literal");
    });

    test("handles chained pipes: x |> f |> g", () => {
      const program = parseSource(`ƒ f(x: Int) → Int { x + 1 }
ƒ g(x: Int) → Int { x * 2 }
ƒ test() → Int { 5 |> f |> g }`);
      const desugared = desugar(program);

      const testFn = desugared.declarations.find(
        (d) => d.kind === "fn" && d.name === "test"
      );
      if (!testFn || testFn.kind !== "fn") {
        throw new Error("Expected test function");
      }

      // After desugaring: g(f(5))
      const body = testFn.body;
      if (!body.expr || body.expr.kind !== "call") {
        throw new Error("Expected outer call expression");
      }

      // Outer call should be g
      expect(body.expr.callee.kind).toBe("ident");
      if (body.expr.callee.kind === "ident") {
        expect(body.expr.callee.name).toBe("g");
      }

      // Argument to g should be f(5)
      const innerCall = body.expr.args[0];
      expect(innerCall.kind).toBe("call");
      if (innerCall.kind === "call") {
        expect(innerCall.callee.kind).toBe("ident");
        if (innerCall.callee.kind === "ident") {
          expect(innerCall.callee.name).toBe("f");
        }
      }
    });
  });

  describe("Expression traversal", () => {
    test("desugars nested expressions", () => {
      const program = parseSource(`ƒ inc(x: Int) → Int { x + 1 }
ƒ test() → Int {
  let x = 5 |> inc
  x
}`);
      const desugared = desugar(program);

      const testFn = desugared.declarations.find(
        (d) => d.kind === "fn" && d.name === "test"
      );
      if (!testFn || testFn.kind !== "fn") {
        throw new Error("Expected test function");
      }

      // The let statement should have a desugared init expression
      const letStmt = testFn.body.statements[0];
      if (!letStmt || letStmt.kind !== "let") {
        throw new Error("Expected let statement");
      }

      // The init should be inc(5), not 5 |> inc
      expect(letStmt.init.kind).toBe("call");
    });

    test("desugars expressions in if conditions", () => {
      const program = parseSource(`ƒ isPositive(x: Int) → Bool { x > 0 }
ƒ test(x: Int) → Int {
  if x |> isPositive { 1 } else { 0 }
}`);
      const desugared = desugar(program);

      const testFn = desugared.declarations.find(
        (d) => d.kind === "fn" && d.name === "test"
      );
      if (!testFn || testFn.kind !== "fn") {
        throw new Error("Expected test function");
      }

      // The if condition should be isPositive(x), not x |> isPositive
      const ifExpr = testFn.body.expr;
      if (!ifExpr || ifExpr.kind !== "if") {
        throw new Error("Expected if expression");
      }

      expect(ifExpr.condition.kind).toBe("call");
    });
  });
});
