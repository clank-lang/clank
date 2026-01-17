/**
 * Parser Tests
 */

import { describe, test, expect } from "bun:test";
import { tokenizeString } from "../../src/lexer";
import { parse, type Program, type Expr, type Stmt, type Decl, type TypeExpr } from "../../src/parser";

function parseProgram(source: string): { program: Program; errors: string[] } {
  const { tokens, errors: lexErrors } = tokenizeString(source);
  if (lexErrors.length > 0) {
    return { program: { kind: "program", id: "error", span: tokens[0].span, declarations: [] }, errors: lexErrors.map(e => e.message) };
  }
  const { program, errors: parseErrors } = parse(tokens);
  return { program, errors: parseErrors.map(e => e.message) };
}

function parseExpr(source: string): Expr {
  const { program } = parseProgram(`fn test() -> Int { ${source} }`);
  const fn = program.declarations[0] as any;
  return fn.body.expr ?? fn.body.statements[0]?.expr;
}

function parseStmt(source: string): Stmt {
  const { program } = parseProgram(`fn test() -> Int { ${source}; 0 }`);
  const fn = program.declarations[0] as any;
  return fn.body.statements[0];
}

function parseDecl(source: string): Decl {
  const { program } = parseProgram(source);
  return program.declarations[0];
}

function parseType(source: string): TypeExpr {
  const { program } = parseProgram(`fn test(x: ${source}) -> Int { 0 }`);
  const fn = program.declarations[0] as any;
  return fn.params[0].type;
}

describe("Parser", () => {
  describe("Declarations", () => {
    describe("Module Declaration", () => {
      test("parses mod declaration", () => {
        const decl = parseDecl("mod mymodule");
        expect(decl.kind).toBe("mod");
        expect((decl as any).name).toBe("mymodule");
      });
    });

    describe("Use Declaration", () => {
      test("parses simple use", () => {
        const decl = parseDecl("use std");
        expect(decl.kind).toBe("use");
        expect((decl as any).path).toEqual(["std"]);
      });

      test("parses dotted use path", () => {
        const decl = parseDecl("use std.io.print");
        expect(decl.kind).toBe("use");
        expect((decl as any).path).toEqual(["std", "io", "print"]);
      });

      test("parses use with items", () => {
        const decl = parseDecl("use std.io.{print, read}");
        expect(decl.kind).toBe("use");
        expect((decl as any).path).toEqual(["std", "io"]);
        expect((decl as any).items).toEqual(["print", "read"]);
      });
    });

    describe("Type Alias Declaration", () => {
      test("parses simple type alias", () => {
        const decl = parseDecl("type UserId = Int");
        expect(decl.kind).toBe("typeAlias");
        expect((decl as any).name).toBe("UserId");
        expect((decl as any).type.kind).toBe("named");
      });

      test("parses generic type alias", () => {
        const decl = parseDecl("type Pair[T] = (T, T)");
        expect(decl.kind).toBe("typeAlias");
        expect((decl as any).typeParams).toHaveLength(1);
        expect((decl as any).typeParams[0].name).toBe("T");
      });
    });

    describe("Record Declaration", () => {
      test("parses record with fields", () => {
        const decl = parseDecl("rec Point { x: Float, y: Float }");
        expect(decl.kind).toBe("rec");
        expect((decl as any).name).toBe("Point");
        expect((decl as any).fields).toHaveLength(2);
        expect((decl as any).fields[0].name).toBe("x");
        expect((decl as any).fields[1].name).toBe("y");
      });

      test("parses generic record", () => {
        const decl = parseDecl("rec Container[T] { value: T }");
        expect((decl as any).typeParams).toHaveLength(1);
        expect((decl as any).typeParams[0].name).toBe("T");
      });
    });

    describe("Sum Type Declaration", () => {
      test("parses simple sum type", () => {
        const decl = parseDecl("sum Option[T] { Some(T), None }");
        expect(decl.kind).toBe("sum");
        expect((decl as any).name).toBe("Option");
        expect((decl as any).variants).toHaveLength(2);
        expect((decl as any).variants[0].name).toBe("Some");
        expect((decl as any).variants[1].name).toBe("None");
      });

      test("parses variant with named fields", () => {
        const decl = parseDecl("sum Shape { Circle(center: Point, radius: Float) }");
        expect((decl as any).variants[0].fields).toHaveLength(2);
        expect((decl as any).variants[0].fields[0].name).toBe("center");
      });
    });

    describe("Function Declaration", () => {
      test("parses simple function", () => {
        const decl = parseDecl("fn add(a: Int, b: Int) -> Int { a + b }");
        expect(decl.kind).toBe("fn");
        expect((decl as any).name).toBe("add");
        expect((decl as any).params).toHaveLength(2);
      });

      test("parses generic function", () => {
        const decl = parseDecl("fn identity[T](x: T) -> T { x }");
        expect((decl as any).typeParams).toHaveLength(1);
        expect((decl as any).typeParams[0].name).toBe("T");
      });

      test("parses function with precondition", () => {
        const decl = parseDecl("fn div(n: Int, d: Int) -> Int pre d != 0 { n / d }");
        expect((decl as any).precondition).toBeDefined();
        expect((decl as any).precondition.kind).toBe("binary");
      });

      test("parses function with postcondition", () => {
        const decl = parseDecl("fn abs(n: Int) -> Int post result >= 0 { if n < 0 { -n } else { n } }");
        expect((decl as any).postcondition).toBeDefined();
      });

      test("parses function with both pre and post", () => {
        const decl = parseDecl("fn f(x: Int) -> Int pre x > 0 post result > x { x + 1 }");
        expect((decl as any).precondition).toBeDefined();
        expect((decl as any).postcondition).toBeDefined();
      });
    });

    describe("External Declaration", () => {
      test("parses external function", () => {
        const decl = parseDecl('external fn now() -> Int = "Date.now"');
        expect(decl.kind).toBe("externalFn");
        expect((decl as any).name).toBe("now");
        expect((decl as any).jsName).toBe("Date.now");
      });

      test("parses external module", () => {
        const decl = parseDecl('external mod lodash = "lodash" { fn chunk[T](arr: [T], size: Int) -> [[T]] }');
        expect(decl.kind).toBe("externalMod");
        expect((decl as any).name).toBe("lodash");
        expect((decl as any).jsModule).toBe("lodash");
        expect((decl as any).functions).toHaveLength(1);
      });
    });
  });

  describe("Type Expressions", () => {
    test("parses named type", () => {
      const type = parseType("Int");
      expect(type.kind).toBe("named");
      expect((type as any).name).toBe("Int");
    });

    test("parses generic type", () => {
      const type = parseType("Option[Int]");
      expect(type.kind).toBe("named");
      expect((type as any).name).toBe("Option");
      expect((type as any).args).toHaveLength(1);
    });

    test("parses array type", () => {
      const type = parseType("[Int]");
      expect(type.kind).toBe("array");
      expect((type as any).element.kind).toBe("named");
    });

    test("parses tuple type", () => {
      const type = parseType("(Int, Str)");
      expect(type.kind).toBe("tuple");
      expect((type as any).elements).toHaveLength(2);
    });

    test("parses function type", () => {
      const type = parseType("(Int, Int) -> Int");
      expect(type.kind).toBe("function");
      expect((type as any).params).toHaveLength(2);
    });

    test("parses optional type sugar", () => {
      const type = parseType("Int?");
      expect(type.kind).toBe("named");
      expect((type as any).name).toBe("Option");
      expect((type as any).args).toHaveLength(1);
    });

    test("parses unit type", () => {
      const type = parseType("()");
      expect(type.kind).toBe("named");
      expect((type as any).name).toBe("Unit");
    });
  });

  describe("Statements", () => {
    describe("Let Statement", () => {
      test("parses let with type annotation", () => {
        const stmt = parseStmt("let x: Int = 5");
        expect(stmt.kind).toBe("let");
        expect((stmt as any).pattern.name).toBe("x");
        expect((stmt as any).type).toBeDefined();
        expect((stmt as any).mutable).toBe(false);
      });

      test("parses let mut", () => {
        const stmt = parseStmt("let mut x = 5");
        expect((stmt as any).mutable).toBe(true);
      });

      test("parses let with destructuring", () => {
        const stmt = parseStmt("let (a, b) = pair");
        expect((stmt as any).pattern.kind).toBe("tuple");
      });
    });

    describe("For Statement", () => {
      test("parses for loop", () => {
        const stmt = parseStmt("for x in items { process(x) }");
        expect(stmt.kind).toBe("for");
        expect((stmt as any).pattern.name).toBe("x");
      });

      test("parses for with destructuring", () => {
        const stmt = parseStmt("for (i, x) in items.enumerate() { process(i, x) }");
        expect((stmt as any).pattern.kind).toBe("tuple");
      });
    });

    describe("While Statement", () => {
      test("parses while loop", () => {
        const stmt = parseStmt("while x > 0 { x = x - 1 }");
        expect(stmt.kind).toBe("while");
        expect((stmt as any).condition.kind).toBe("binary");
      });
    });

    describe("Loop Statement", () => {
      test("parses infinite loop", () => {
        const stmt = parseStmt("loop { break }");
        expect(stmt.kind).toBe("loop");
      });
    });

    describe("Return Statement", () => {
      test("parses return with value", () => {
        const stmt = parseStmt("return 42");
        expect(stmt.kind).toBe("return");
        expect((stmt as any).value).toBeDefined();
      });

      test("parses return without value", () => {
        const { program } = parseProgram("fn test() -> () { return }");
        const fn = program.declarations[0] as any;
        const stmt = fn.body.statements[0];
        expect(stmt.kind).toBe("return");
        expect(stmt.value).toBeUndefined();
      });
    });

    describe("Assert Statement", () => {
      test("parses assert", () => {
        const stmt = parseStmt("assert x > 0");
        expect(stmt.kind).toBe("assert");
        expect((stmt as any).condition.kind).toBe("binary");
      });

      test("parses assert with message", () => {
        const stmt = parseStmt('assert x > 0 : "x must be positive"');
        expect((stmt as any).message).toBe("x must be positive");
      });
    });

    describe("Assignment Statement", () => {
      test("parses simple assignment", () => {
        const stmt = parseStmt("x = 5");
        expect(stmt.kind).toBe("assign");
        expect((stmt as any).target.name).toBe("x");
      });

      test("parses index assignment", () => {
        const stmt = parseStmt("arr[0] = 5");
        expect(stmt.kind).toBe("assign");
        expect((stmt as any).target.kind).toBe("index");
      });

      test("parses field assignment", () => {
        const stmt = parseStmt("obj.field = 5");
        expect(stmt.kind).toBe("assign");
        expect((stmt as any).target.kind).toBe("field");
      });
    });
  });

  describe("Expressions", () => {
    describe("Literals", () => {
      test("parses integer literal", () => {
        const expr = parseExpr("42");
        expect(expr.kind).toBe("literal");
        expect((expr as any).value.kind).toBe("int");
        expect((expr as any).value.value).toBe(42n);
      });

      test("parses float literal", () => {
        const expr = parseExpr("3.14");
        expect(expr.kind).toBe("literal");
        expect((expr as any).value.kind).toBe("float");
      });

      test("parses string literal", () => {
        const expr = parseExpr('"hello"');
        expect(expr.kind).toBe("literal");
        expect((expr as any).value.kind).toBe("string");
        expect((expr as any).value.value).toBe("hello");
      });

      test("parses boolean literals", () => {
        expect((parseExpr("true") as any).value.value).toBe(true);
        expect((parseExpr("false") as any).value.value).toBe(false);
      });

      test("parses unit literal", () => {
        const expr = parseExpr("()");
        expect(expr.kind).toBe("literal");
        expect((expr as any).value.kind).toBe("unit");
      });
    });

    describe("Binary Expressions", () => {
      test("parses arithmetic operators", () => {
        expect((parseExpr("1 + 2") as any).op).toBe("+");
        expect((parseExpr("1 - 2") as any).op).toBe("-");
        expect((parseExpr("1 * 2") as any).op).toBe("*");
        expect((parseExpr("1 / 2") as any).op).toBe("/");
        expect((parseExpr("1 % 2") as any).op).toBe("%");
        expect((parseExpr("2 ^ 3") as any).op).toBe("^");
      });

      test("parses comparison operators", () => {
        expect((parseExpr("1 == 2") as any).op).toBe("==");
        expect((parseExpr("1 != 2") as any).op).toBe("!=");
        expect((parseExpr("1 < 2") as any).op).toBe("<");
        expect((parseExpr("1 > 2") as any).op).toBe(">");
        expect((parseExpr("1 <= 2") as any).op).toBe("<=");
        expect((parseExpr("1 >= 2") as any).op).toBe(">=");
      });

      test("parses logical operators", () => {
        expect((parseExpr("a && b") as any).op).toBe("&&");
        expect((parseExpr("a || b") as any).op).toBe("||");
      });

      test("parses string concatenation", () => {
        expect((parseExpr('"a" ++ "b"') as any).op).toBe("++");
      });

      test("parses pipe operator", () => {
        expect((parseExpr("x |> f") as any).op).toBe("|>");
      });

      test("respects precedence", () => {
        const expr = parseExpr("1 + 2 * 3");
        expect(expr.kind).toBe("binary");
        expect((expr as any).op).toBe("+");
        expect((expr as any).right.op).toBe("*");
      });

      test("power is right-associative", () => {
        const expr = parseExpr("2 ^ 3 ^ 4");
        expect((expr as any).op).toBe("^");
        expect((expr as any).right.op).toBe("^");
      });
    });

    describe("Unary Expressions", () => {
      test("parses negation", () => {
        const expr = parseExpr("-x");
        expect(expr.kind).toBe("unary");
        expect((expr as any).op).toBe("-");
      });

      test("parses logical not", () => {
        const expr = parseExpr("!x");
        expect(expr.kind).toBe("unary");
        expect((expr as any).op).toBe("!");
      });
    });

    describe("Call Expressions", () => {
      test("parses function call", () => {
        const expr = parseExpr("foo(1, 2)");
        expect(expr.kind).toBe("call");
        expect((expr as any).callee.name).toBe("foo");
        expect((expr as any).args).toHaveLength(2);
      });

      test("parses method call", () => {
        const expr = parseExpr("obj.method(x)");
        expect(expr.kind).toBe("call");
        expect((expr as any).callee.kind).toBe("field");
      });

      test("parses chained calls", () => {
        const expr = parseExpr("a.b().c()");
        expect(expr.kind).toBe("call");
      });
    });

    describe("Field and Index Access", () => {
      test("parses field access", () => {
        const expr = parseExpr("obj.field");
        expect(expr.kind).toBe("field");
        expect((expr as any).field).toBe("field");
      });

      test("parses index access", () => {
        const expr = parseExpr("arr[0]");
        expect(expr.kind).toBe("index");
      });

      test("parses chained access", () => {
        const expr = parseExpr("a.b[0].c");
        expect(expr.kind).toBe("field");
        expect((expr as any).field).toBe("c");
      });
    });

    describe("Lambda Expressions", () => {
      test("parses simple lambda", () => {
        const expr = parseExpr("\\x -> x + 1");
        expect(expr.kind).toBe("lambda");
        expect((expr as any).params).toHaveLength(1);
        expect((expr as any).params[0].name).toBe("x");
      });

      test("parses lambda with typed params", () => {
        const expr = parseExpr("\\(x: Int) -> x + 1");
        expect((expr as any).params[0].type).toBeDefined();
      });

      test("parses multi-param lambda", () => {
        const expr = parseExpr("\\(x, y) -> x + y");
        expect((expr as any).params).toHaveLength(2);
      });
    });

    describe("If Expressions", () => {
      test("parses if-else", () => {
        const expr = parseExpr("if x > 0 { 1 } else { 0 }");
        expect(expr.kind).toBe("if");
        expect((expr as any).thenBranch).toBeDefined();
        expect((expr as any).elseBranch).toBeDefined();
      });

      test("parses if without else", () => {
        const expr = parseExpr("if x > 0 { do_something() }");
        expect((expr as any).elseBranch).toBeUndefined();
      });

      test("parses else-if chain", () => {
        const expr = parseExpr("if a { 1 } else if b { 2 } else { 3 }");
        expect((expr as any).elseBranch.kind).toBe("if");
      });
    });

    describe("Match Expressions", () => {
      test("parses simple match", () => {
        const expr = parseExpr("match x { 0 -> a, _ -> b }");
        expect(expr.kind).toBe("match");
        expect((expr as any).arms).toHaveLength(2);
      });

      test("parses match with guards", () => {
        const expr = parseExpr("match n { x if x > 0 -> positive, _ -> other }");
        expect((expr as any).arms[0].guard).toBeDefined();
      });

      test("parses match with variant patterns", () => {
        const expr = parseExpr("match opt { Some(x) -> x, None -> 0 }");
        expect((expr as any).arms[0].pattern.kind).toBe("variant");
      });
    });

    describe("Block Expressions", () => {
      test("parses block with trailing expression", () => {
        const expr = parseExpr("{ let x = 1; x + 1 }");
        expect(expr.kind).toBe("block");
        expect((expr as any).statements).toHaveLength(1);
        expect((expr as any).expr).toBeDefined();
      });

      test("parses empty block", () => {
        const { program } = parseProgram("fn test() -> () { {} }");
        const fn = program.declarations[0] as any;
        const block = fn.body.expr;
        expect(block.kind).toBe("block");
        expect(block.statements).toHaveLength(0);
      });
    });

    describe("Array Expressions", () => {
      test("parses array literal", () => {
        const expr = parseExpr("[1, 2, 3]");
        expect(expr.kind).toBe("array");
        expect((expr as any).elements).toHaveLength(3);
      });

      test("parses empty array", () => {
        const expr = parseExpr("[]");
        expect(expr.kind).toBe("array");
        expect((expr as any).elements).toHaveLength(0);
      });
    });

    describe("Tuple Expressions", () => {
      test("parses tuple literal", () => {
        const expr = parseExpr("(1, 2, 3)");
        expect(expr.kind).toBe("tuple");
        expect((expr as any).elements).toHaveLength(3);
      });
    });

    describe("Propagate Expression", () => {
      test("parses error propagation", () => {
        const expr = parseExpr("foo()?");
        expect(expr.kind).toBe("propagate");
        expect((expr as any).expr.kind).toBe("call");
      });
    });
  });

  describe("Patterns", () => {
    test("parses wildcard pattern", () => {
      const { program } = parseProgram("fn test() -> Int { match x { _ -> 0 } }");
      const fn = program.declarations[0] as any;
      const arm = fn.body.expr.arms[0];
      expect(arm.pattern.kind).toBe("wildcard");
    });

    test("parses identifier pattern", () => {
      const { program } = parseProgram("fn test() -> Int { match x { y -> y } }");
      const fn = program.declarations[0] as any;
      const arm = fn.body.expr.arms[0];
      expect(arm.pattern.kind).toBe("ident");
      expect(arm.pattern.name).toBe("y");
    });

    test("parses literal pattern", () => {
      const { program } = parseProgram("fn test() -> Int { match x { 0 -> a, 1 -> b, _ -> c } }");
      const fn = program.declarations[0] as any;
      expect(fn.body.expr.arms[0].pattern.kind).toBe("literal");
    });

    test("parses tuple pattern", () => {
      const { program } = parseProgram("fn test() -> Int { match x { (a, b) -> a + b } }");
      const fn = program.declarations[0] as any;
      const arm = fn.body.expr.arms[0];
      expect(arm.pattern.kind).toBe("tuple");
      expect(arm.pattern.elements).toHaveLength(2);
    });

    test("parses variant pattern", () => {
      const { program } = parseProgram("fn test() -> Int { match x { Some(v) -> v, None -> 0 } }");
      const fn = program.declarations[0] as any;
      expect(fn.body.expr.arms[0].pattern.kind).toBe("variant");
      expect(fn.body.expr.arms[0].pattern.name).toBe("Some");
    });

    test("parses record pattern", () => {
      const { program } = parseProgram("fn test() -> Int { match x { {name, age} -> age } }");
      const fn = program.declarations[0] as any;
      const arm = fn.body.expr.arms[0];
      expect(arm.pattern.kind).toBe("record");
      expect(arm.pattern.fields).toHaveLength(2);
    });
  });

  describe("Complete Programs", () => {
    test("parses hello world", () => {
      const { program, errors } = parseProgram(`
        mod hello
        use std.io.println
        fn main() -> () {
          println("Hello, Axon!")
        }
      `);
      expect(errors).toHaveLength(0);
      expect(program.declarations).toHaveLength(3);
    });

    test("parses factorial function", () => {
      const { program, errors } = parseProgram(`
        fn factorial(n: Nat) -> Nat {
          if n <= 1 {
            1
          } else {
            n * factorial(n - 1)
          }
        }
      `);
      expect(errors).toHaveLength(0);
      const fn = program.declarations[0] as any;
      expect(fn.name).toBe("factorial");
    });

    test("parses safe division with refinement", () => {
      const { program, errors } = parseProgram(`
        fn div(n: Int, d: Int) -> Int pre d != 0 {
          n / d
        }

        fn safe_div(n: Int, d: Int) -> Option[Int] {
          if d != 0 {
            Some(div(n, d))
          } else {
            None
          }
        }
      `);
      expect(errors).toHaveLength(0);
      expect(program.declarations).toHaveLength(2);
    });

    test("parses sum type and match", () => {
      const { errors } = parseProgram(`
        sum Json {
          Null,
          Bool(Bool),
          Number(Float),
          String(Str),
          Array([Json]),
          Object(Map[Str, Json])
        }

        fn json_type(j: Json) -> Str {
          match j {
            Null -> "null",
            Bool(_) -> "boolean",
            Number(_) -> "number",
            String(_) -> "string",
            Array(_) -> "array",
            Object(_) -> "object"
          }
        }
      `);
      expect(errors).toHaveLength(0);
    });

    test("parses pipeline expressions", () => {
      const { errors } = parseProgram(`
        fn process(items: [Int]) -> [Int] {
          items
            |> filter(\\x -> x > 0)
            |> map(\\x -> x * 2)
        }
      `);
      expect(errors).toHaveLength(0);
    });

    test("parses external declarations", () => {
      const { program, errors } = parseProgram(`
        external fn now() -> Int = "Date.now"
        external fn random() -> Float = "Math.random"

        external mod lodash = "lodash" {
          fn chunk[T](arr: [T], size: Int) -> [[T]]
          fn uniq[T](arr: [T]) -> [T]
        }
      `);
      expect(errors).toHaveLength(0);
      expect(program.declarations).toHaveLength(3);
    });
  });

  describe("Error Handling", () => {
    test("reports missing function body", () => {
      const { errors } = parseProgram("fn test() -> Int");
      expect(errors.length).toBeGreaterThan(0);
    });

    test("reports missing type annotation", () => {
      const { errors } = parseProgram("fn test(x) -> Int { x }");
      expect(errors.length).toBeGreaterThan(0);
    });

    test("reports unterminated block", () => {
      const { errors } = parseProgram("fn test() -> Int { 1");
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
