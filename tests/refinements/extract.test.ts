/**
 * Tests for refinement predicate extraction from AST expressions.
 */

import { describe, test, expect } from "bun:test";
import { extractPredicate, extractTerm } from "../../src/refinements/extract";
import { formatPredicate, formatTerm } from "../../src/types/types";
import type { Expr, BinaryExpr, LiteralExpr, IdentExpr, BinaryOp } from "../../src/parser/ast";
import type { SourceSpan } from "../../src/utils/span";

// Helper to create a minimal span
const span: SourceSpan = {
  file: "test.clank",
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

// Helper to create literal expressions
function intLit(value: bigint): LiteralExpr {
  return { kind: "literal", id: "test", value: { kind: "int", value, suffix: null }, span };
}

function boolLit(value: boolean): LiteralExpr {
  return { kind: "literal", id: "test", value: { kind: "bool", value }, span };
}

// Helper to create identifier expressions
function ident(name: string): IdentExpr {
  return { kind: "ident", id: "test", name, span };
}

// Helper to create binary expressions
function binary(left: Expr, op: BinaryOp, right: Expr): BinaryExpr {
  return { kind: "binary", id: "test", left, op, right, span };
}

describe("extractPredicate", () => {
  test("extracts simple comparison: x > 0", () => {
    const expr = binary(ident("x"), ">", intLit(0n));
    const pred = extractPredicate(expr);
    expect(pred.kind).toBe("compare");
    expect(formatPredicate(pred)).toBe("x > 0");
  });

  test("extracts equality comparison: x == 5", () => {
    const expr = binary(ident("x"), "==", intLit(5n));
    const pred = extractPredicate(expr);
    expect(pred.kind).toBe("compare");
    expect(formatPredicate(pred)).toBe("x == 5");
  });

  test("extracts inequality: x != 0", () => {
    const expr = binary(ident("x"), "!=", intLit(0n));
    const pred = extractPredicate(expr);
    expect(pred.kind).toBe("compare");
    expect(formatPredicate(pred)).toBe("x != 0");
  });

  test("extracts Unicode inequality: x ≠ 0", () => {
    const expr = binary(ident("x"), "≠", intLit(0n));
    const pred = extractPredicate(expr);
    expect(pred.kind).toBe("compare");
    expect(formatPredicate(pred)).toBe("x != 0");
  });

  test("extracts logical AND: x > 0 && y > 0", () => {
    const left = binary(ident("x"), ">", intLit(0n));
    const right = binary(ident("y"), ">", intLit(0n));
    const expr = binary(left, "&&", right);
    const pred = extractPredicate(expr);
    expect(pred.kind).toBe("and");
    expect(formatPredicate(pred)).toBe("(x > 0 && y > 0)");
  });

  test("extracts logical OR: x > 0 || x < -10", () => {
    const left = binary(ident("x"), ">", intLit(0n));
    const right = binary(ident("x"), "<", intLit(-10n));
    const expr = binary(left, "||", right);
    const pred = extractPredicate(expr);
    expect(pred.kind).toBe("or");
  });

  test("extracts boolean literal true", () => {
    const pred = extractPredicate(boolLit(true));
    expect(pred.kind).toBe("true");
  });

  test("extracts boolean literal false", () => {
    const pred = extractPredicate(boolLit(false));
    expect(pred.kind).toBe("false");
  });
});

describe("extractTerm", () => {
  test("extracts integer literal", () => {
    const term = extractTerm(intLit(42n));
    expect(term.kind).toBe("int");
    expect(formatTerm(term)).toBe("42");
  });

  test("extracts variable", () => {
    const term = extractTerm(ident("x"));
    expect(term.kind).toBe("var");
    expect(formatTerm(term)).toBe("x");
  });

  test("extracts arithmetic: x + 1", () => {
    const expr = binary(ident("x"), "+", intLit(1n));
    const term = extractTerm(expr);
    expect(term.kind).toBe("binop");
    expect(formatTerm(term)).toBe("(x + 1)");
  });

  test("extracts multiplication: x * y", () => {
    const expr = binary(ident("x"), "*", ident("y"));
    const term = extractTerm(expr);
    expect(term.kind).toBe("binop");
    expect(formatTerm(term)).toBe("(x * y)");
  });
});
