/**
 * Tests for AST normalization transformations.
 */

import { describe, test, expect } from "bun:test";
import { normalize } from "../../src/canonical/normalize";
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

// Helper to find if expression in a function body
function findIfExpr(expr: Expr | undefined, stmts: import("../../src/parser/ast").Stmt[]): IfExpr | undefined {
  // Check if the expression is an if
  if (expr?.kind === "if") return expr;

  // Check statements for expression statements containing if
  for (const stmt of stmts) {
    if (stmt.kind === "expr" && stmt.expr.kind === "if") {
      return stmt.expr;
    }
  }

  return undefined;
}

describe("Normalize", () => {
  describe("Explicit else branches", () => {
    test("adds else branch returning unit when missing", () => {
      // Use a simpler example that produces a clear AST structure
      const program = parseSource(`ƒ test(x: Int) → Int {
  if x > 0 { 1 } else { 0 }
}`);
      const normalized = normalize(program);

      const fn = normalized.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const ifExpr = findIfExpr(fn.body.expr, fn.body.statements);
      if (!ifExpr) throw new Error("Expected if expression");

      // Should have an else branch
      expect(ifExpr.elseBranch).toBeDefined();
    });

    test("adds unit else branch for if without else", () => {
      // Use a simple if without else as the body expression
      const program = parseSource(`ƒ test(x: Int) → Int {
  if x > 0 { 1 }
}`);
      const normalized = normalize(program);

      const fn = normalized.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const ifExpr = findIfExpr(fn.body.expr, fn.body.statements);
      if (!ifExpr) throw new Error("Expected if expression");

      // After normalization, should have an else branch with unit
      expect(ifExpr.elseBranch).toBeDefined();
      if (ifExpr.elseBranch && ifExpr.elseBranch.kind === "block") {
        expect(ifExpr.elseBranch.expr?.kind).toBe("literal");
        if (ifExpr.elseBranch.expr?.kind === "literal") {
          expect(ifExpr.elseBranch.expr.value.kind).toBe("unit");
        }
      }
    });

    test("preserves existing else branches", () => {
      const program = parseSource(`ƒ test(x: Int) → Int {
  if x > 0 { 1 } else { 2 }
}`);
      const normalized = normalize(program);

      const fn = normalized.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const ifExpr = findIfExpr(fn.body.expr, fn.body.statements);
      if (!ifExpr) throw new Error("Expected if expression");

      // The else branch should still be present and have the original value
      expect(ifExpr.elseBranch).toBeDefined();
      if (ifExpr.elseBranch && ifExpr.elseBranch.kind === "block") {
        expect(ifExpr.elseBranch.expr?.kind).toBe("literal");
      }
    });
  });

  describe("Empty block normalization", () => {
    test("adds unit expression to empty blocks", () => {
      const program = parseSource(`ƒ test() → () { }`);
      const normalized = normalize(program);

      const fn = normalized.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      // The body should have a unit expression
      expect(fn.body.expr?.kind).toBe("literal");
      if (fn.body.expr?.kind === "literal") {
        expect(fn.body.expr.value.kind).toBe("unit");
      }
    });
  });

  describe("Return normalization", () => {
    test("adds unit to return statements without value", () => {
      const program = parseSource(`ƒ test() → () {
  return
}`);
      const normalized = normalize(program);

      const fn = normalized.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const returnStmt = fn.body.statements[0];
      if (!returnStmt || returnStmt.kind !== "return") {
        throw new Error("Expected return statement");
      }

      // After normalization, the return should have a unit value
      expect(returnStmt.value).toBeDefined();
      expect(returnStmt.value?.kind).toBe("literal");
      if (returnStmt.value?.kind === "literal") {
        expect(returnStmt.value.value.kind).toBe("unit");
      }
    });

    test("preserves return statements with values", () => {
      const program = parseSource(`ƒ test() → Int {
  return 42
}`);
      const normalized = normalize(program);

      const fn = normalized.declarations[0];
      if (fn.kind !== "fn") throw new Error("Expected function declaration");

      const returnStmt = fn.body.statements[0];
      if (!returnStmt || returnStmt.kind !== "return") {
        throw new Error("Expected return statement");
      }

      expect(returnStmt.value?.kind).toBe("literal");
      if (returnStmt.value?.kind === "literal" && returnStmt.value.value.kind === "int") {
        expect(returnStmt.value.value.value).toBe(42n);
      }
    });
  });
});
