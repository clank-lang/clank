/**
 * Tests for the canonical AST transformer.
 */

import { describe, test, expect } from "bun:test";
import { canonicalize } from "../../src/canonical";
import { parse } from "../../src/parser";
import { tokenize } from "../../src/lexer";
import { SourceFile } from "../../src/utils/source";
import type { Expr, IfExpr } from "../../src/parser/ast";

function parseSource(code: string) {
  const source = new SourceFile("<test>", code);
  const { tokens } = tokenize(source);
  const { program } = parse(tokens);
  return program;
}

// Helper to find if expression in AST
function findIfExpr(expr: Expr | undefined, stmts: import("../../src/parser/ast").Stmt[]): IfExpr | undefined {
  if (expr?.kind === "if") return expr;
  for (const stmt of stmts) {
    if (stmt.kind === "expr" && stmt.expr.kind === "if") {
      return stmt.expr;
    }
  }
  return undefined;
}

describe("Canonicalize", () => {
  test("applies all transformations by default", () => {
    const program = parseSource(`ƒ test(x: Int) → Int {
  if x >= 0 { 1 } else { 0 }
}`);

    const result = canonicalize(program);

    const fn = result.program.declarations[0];
    if (fn.kind !== "fn") throw new Error("Expected function declaration");

    const ifExpr = findIfExpr(fn.body.expr, fn.body.statements);
    if (!ifExpr) throw new Error("Expected if expression");

    // Check that condition is preserved
    if (ifExpr.condition.kind === "binary") {
      expect(ifExpr.condition.op).toBe(">=");
    }

    // Check normalization: else branch should be present
    expect(ifExpr.elseBranch).toBeDefined();
  });

  test("can disable desugaring (pipe operator preserved)", () => {
    const program = parseSource(`ƒ f(x: Int) → Int { x + 1 }
ƒ test() → Int { 5 |> f }`);

    const result = canonicalize(program, { desugar: false });

    const testFn = result.program.declarations.find(
      (d) => d.kind === "fn" && d.name === "test"
    );
    if (!testFn || testFn.kind !== "fn") {
      throw new Error("Expected test function");
    }

    // Without desugaring, the pipe operator should remain as a binary expression
    const body = testFn.body;
    if (!body.expr || body.expr.kind !== "binary") {
      throw new Error("Expected binary expression (pipe preserved)");
    }

    expect(body.expr.op).toBe("|>");
  });

  test("desugaring transforms pipe to call", () => {
    const program = parseSource(`ƒ f(x: Int) → Int { x + 1 }
ƒ test() → Int { 5 |> f }`);

    const result = canonicalize(program, { desugar: true });

    const testFn = result.program.declarations.find(
      (d) => d.kind === "fn" && d.name === "test"
    );
    if (!testFn || testFn.kind !== "fn") {
      throw new Error("Expected test function");
    }

    // With desugaring, the pipe should become a call expression
    const body = testFn.body;
    if (!body.expr || body.expr.kind !== "call") {
      throw new Error("Expected call expression after pipe desugaring");
    }

    // The callee should be f
    expect(body.expr.callee.kind).toBe("ident");
    if (body.expr.callee.kind === "ident") {
      expect(body.expr.callee.name).toBe("f");
    }
  });

  test("can disable normalization", () => {
    // Use a simple if without else as the body expression
    const program = parseSource(`ƒ test(x: Int) → Int {
  if x > 0 { 1 }
}`);

    const result = canonicalize(program, { normalize: false });

    const fn = result.program.declarations[0];
    if (fn.kind !== "fn") throw new Error("Expected function declaration");

    const ifExpr = findIfExpr(fn.body.expr, fn.body.statements);
    if (!ifExpr) throw new Error("Expected if expression");

    // Without normalization, the else branch should not be added
    expect(ifExpr.elseBranch).toBeUndefined();
  });

  test("preserves AST structure", () => {
    const program = parseSource(`ƒ add(a: Int, b: Int) → Int { a + b }`);

    const result = canonicalize(program);

    // Should have the same function
    expect(result.program.declarations.length).toBe(1);
    const fn = result.program.declarations[0];
    if (fn.kind !== "fn") throw new Error("Expected function declaration");

    expect(fn.name).toBe("add");
    expect(fn.params.length).toBe(2);
    expect(fn.params[0].name).toBe("a");
    expect(fn.params[1].name).toBe("b");
  });

  test("generates new node IDs (cloning)", () => {
    const program = parseSource(`ƒ test() → Int { 42 }`);

    const result = canonicalize(program);

    // The canonical AST should have different node IDs (cloned)
    expect(result.program.id).not.toBe(program.id);
  });

  describe("Effect annotations", () => {
    test("collects effect annotations when enabled", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);

      const result = canonicalize(program, {
        annotateEffects: true,
        effectInfo: new Map([["test", new Set(["IO"])]]),
      });

      // Should have some effect annotations
      expect(result.effectAnnotations.size).toBeGreaterThan(0);
    });

    test("returns empty annotations when effect info not provided", () => {
      const program = parseSource(`ƒ test() → Int { 42 }`);

      const result = canonicalize(program, { annotateEffects: true });

      // Effect annotations should be empty when no effect info provided
      expect(result.effectAnnotations.size).toBe(0);
    });
  });
});
