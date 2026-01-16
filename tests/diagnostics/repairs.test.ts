/**
 * Repair generation tests.
 */

import { describe, test, expect } from "bun:test";
import { tokenize } from "../../src/lexer";
import { parse } from "../../src/parser";
import { typecheck } from "../../src/types";
import { generateRepairs } from "../../src/diagnostics";
import { SourceFile } from "../../src/utils/source";
import type { RepairCandidate } from "../../src/diagnostics";

function compileWithRepairs(code: string) {
  const source = new SourceFile("test.clank", code);
  const { tokens, errors: lexErrors } = tokenize(source);
  expect(lexErrors).toHaveLength(0);

  const { program, errors: parseErrors } = parse(tokens);
  expect(parseErrors).toHaveLength(0);

  const { diagnostics, obligations } = typecheck(program);

  const repairResult = generateRepairs({
    program,
    diagnostics,
    obligations,
    holes: [],
  });

  // Backfill repair_refs
  for (const [diagId, repairIds] of repairResult.diagnosticRepairs) {
    const diag = diagnostics.find((d) => d.id === diagId);
    if (diag) diag.repair_refs = repairIds;
  }

  return {
    diagnostics,
    obligations,
    repairs: repairResult.repairs,
  };
}

describe("repair generation", () => {
  describe("E2013 ImmutableAssign", () => {
    test("generates repair for assignment to immutable variable", () => {
      const code = `
        fn main() -> Unit {
          let x = 1
          x = 2
        }
      `;
      const result = compileWithRepairs(code);

      // Should have the immutable assign error
      const immutableError = result.diagnostics.find((d) => d.code === "E2013");
      expect(immutableError).toBeDefined();

      // Should have generated a repair
      expect(result.repairs.length).toBeGreaterThanOrEqual(1);

      const repair = result.repairs.find((r) => r.title.includes("mutable"));
      expect(repair).toBeDefined();
      expect(repair!.confidence).toBe("high");
      expect(repair!.safety).toBe("behavior_preserving");
      expect(repair!.kind).toBe("local_fix");
      expect(repair!.edits).toHaveLength(1);
      expect(repair!.edits[0].op).toBe("replace_node");
    });

    test("repair targets the correct let statement", () => {
      const code = `
        fn main() -> Unit {
          let x = 1
          let y = 2
          x = 3
        }
      `;
      const result = compileWithRepairs(code);

      const repair = result.repairs.find((r) => r.title.includes("'x'"));
      expect(repair).toBeDefined();
      expect(repair!.targets.diagnostic_codes).toContain("E2013");
    });

    test("repair has expected_delta with diagnostic ID", () => {
      const code = `
        fn main() -> Unit {
          let x = 1
          x = 2
        }
      `;
      const result = compileWithRepairs(code);

      const immutableError = result.diagnostics.find((d) => d.code === "E2013");
      const repair = result.repairs.find((r) => r.title.includes("mutable"));

      expect(repair!.expected_delta.diagnostics_resolved).toContain(immutableError!.id);
    });

    test("diagnostic has repair_refs linking to repair", () => {
      const code = `
        fn main() -> Unit {
          let x = 1
          x = 2
        }
      `;
      const result = compileWithRepairs(code);

      const immutableError = result.diagnostics.find((d) => d.code === "E2013");
      const repair = result.repairs.find((r) => r.title.includes("mutable"));

      expect(immutableError!.repair_refs).toContain(repair!.id);
    });
  });

  describe("E4001 EffectNotAllowed", () => {
    test("generates repair for calling IO function from pure function", () => {
      const code = `
        fn pure_fn() -> Int {
          println("side effect")
          42
        }
      `;
      const result = compileWithRepairs(code);

      // Should have the effect not allowed error
      const effectError = result.diagnostics.find((d) => d.code === "E4001");
      expect(effectError).toBeDefined();

      // Should have generated a repair
      const repair = result.repairs.find((r) => r.title.includes("IO"));
      expect(repair).toBeDefined();
      expect(repair!.confidence).toBe("medium");
      expect(repair!.safety).toBe("likely_preserving");
      expect(repair!.edits).toHaveLength(1);
      expect(repair!.edits[0].op).toBe("widen_effect");
    });

    test("widen_effect repair contains correct effect name", () => {
      const code = `
        fn pure_fn() -> Int {
          println("side effect")
          42
        }
      `;
      const result = compileWithRepairs(code);

      const repair = result.repairs.find((r) => r.title.includes("IO"));
      const edit = repair!.edits[0] as { op: "widen_effect"; fn_id: string; add_effects: string[] };

      expect(edit.op).toBe("widen_effect");
      expect(edit.add_effects).toContain("IO");
    });

    test("repair targets the correct function", () => {
      const code = `
        fn helper() -> IO + Unit {
          println("ok")
        }
        fn caller() -> Int {
          helper()
          42
        }
      `;
      const result = compileWithRepairs(code);

      // The repair should target 'caller', not 'helper'
      const repair = result.repairs.find((r) => r.title.includes("'caller'"));
      expect(repair).toBeDefined();
    });
  });

  describe("E4002 UnhandledEffect", () => {
    test("generates repair for error propagation without Err effect", () => {
      const code = `
        fn fallible() -> Option[Int] { Some(42) }
        fn caller() -> Int {
          fallible()?
        }
      `;
      const result = compileWithRepairs(code);

      // Should have the unhandled effect error
      const effectError = result.diagnostics.find((d) => d.code === "E4002");
      expect(effectError).toBeDefined();

      // Should have generated a repair
      const repair = result.repairs.find((r) => r.title.includes("Err"));
      expect(repair).toBeDefined();
      expect(repair!.edits[0].op).toBe("widen_effect");
    });
  });

  describe("E1001 UnresolvedName", () => {
    test("generates repair for typo in variable name", () => {
      const code = `
        fn main() -> Unit {
          let hello = 1
          helo
        }
      `;
      const result = compileWithRepairs(code);

      // Should have the unresolved name error
      const unresolvedError = result.diagnostics.find((d) => d.code === "E1001");
      expect(unresolvedError).toBeDefined();

      // Should have generated repairs with similar names
      const repair = result.repairs.find((r) => r.title.includes("'hello'"));
      expect(repair).toBeDefined();
      expect(repair!.confidence).toBe("high");
      expect(repair!.safety).toBe("behavior_changing");
      expect(repair!.edits[0].op).toBe("rename_symbol");
    });

    test("repair includes old and new name in edit", () => {
      const code = `
        fn main() -> Unit {
          let count = 1
          coutn
        }
      `;
      const result = compileWithRepairs(code);

      const repair = result.repairs.find((r) => r.title.includes("'count'"));
      expect(repair).toBeDefined();

      const edit = repair!.edits[0] as { op: "rename_symbol"; old_name: string; new_name: string };
      expect(edit.op).toBe("rename_symbol");
      expect(edit.old_name).toBe("coutn");
      expect(edit.new_name).toBe("count");
    });

    test("generates multiple repairs for multiple similar names", () => {
      const code = `
        fn main() -> Unit {
          let cat = 1
          let car = 2
          cas
        }
      `;
      const result = compileWithRepairs(code);

      // Should have repairs for both 'cat' and 'car'
      const catRepair = result.repairs.find((r) => r.title.includes("'cat'"));
      const carRepair = result.repairs.find((r) => r.title.includes("'car'"));

      expect(catRepair).toBeDefined();
      expect(carRepair).toBeDefined();
    });
  });

  describe("E2004 UnknownField", () => {
    test("generates repair for typo in field name", () => {
      const code = `
        rec Person { name: String, age: Int }
        fn get_name(p: Person) -> String { p.nme }
      `;
      const result = compileWithRepairs(code);

      // Should have the unknown field error
      const fieldError = result.diagnostics.find((d) => d.code === "E2004");
      expect(fieldError).toBeDefined();

      // Should have generated repair with similar field
      const repair = result.repairs.find((r) => r.title.includes("'name'"));
      expect(repair).toBeDefined();
      expect(repair!.confidence).toBe("high");
      expect(repair!.safety).toBe("behavior_changing");
      expect(repair!.edits[0].op).toBe("rename_field");
    });

    test("repair includes old and new field name in edit", () => {
      const code = `
        rec Point { x: Int, y: Int }
        fn get_y(p: Point) -> Int { p.yy }
      `;
      const result = compileWithRepairs(code);

      const repair = result.repairs.find((r) => r.title.includes("'y'"));
      expect(repair).toBeDefined();

      const edit = repair!.edits[0] as { op: "rename_field"; old_name: string; new_name: string };
      expect(edit.op).toBe("rename_field");
      expect(edit.old_name).toBe("yy");
      expect(edit.new_name).toBe("y");
    });

    test("includes available fields in diagnostic", () => {
      const code = `
        rec Config { host: String, port: Int }
        fn get_port(c: Config) -> Int { c.prot }
      `;
      const result = compileWithRepairs(code);

      const fieldError = result.diagnostics.find((d) => d.code === "E2004");
      expect(fieldError).toBeDefined();
      expect(fieldError!.structured.available_fields).toContain("host");
      expect(fieldError!.structured.available_fields).toContain("port");
    });
  });

  describe("E1005 UnresolvedType", () => {
    test("generates repair for typo in type name", () => {
      const code = `
        fn identity(x: Intger) -> Int { x }
      `;
      const result = compileWithRepairs(code);

      // Should have the unresolved type error
      const typeError = result.diagnostics.find((d) => d.code === "E1005");
      expect(typeError).toBeDefined();

      // Should have generated repair with similar type
      const repair = result.repairs.find((r) => r.title.includes("'Int'"));
      expect(repair).toBeDefined();
      expect(repair!.confidence).toBe("high");
      expect(repair!.safety).toBe("behavior_changing");
      expect(repair!.edits[0].op).toBe("rename_symbol");
    });

    test("suggests similar built-in types", () => {
      const code = `
        fn to_string(x: Strin) -> String { x }
      `;
      const result = compileWithRepairs(code);

      const typeError = result.diagnostics.find((d) => d.code === "E1005");
      expect(typeError).toBeDefined();
      expect(typeError!.structured.similar_types).toContain("String");
    });

    test("includes available types in error structured data", () => {
      const code = `
        rec MyRecord { value: Int }
        fn test(x: MyRecrd) -> Int { 42 }
      `;
      const result = compileWithRepairs(code);

      const typeError = result.diagnostics.find((d) => d.code === "E1005");
      expect(typeError).toBeDefined();
      expect(typeError!.structured.available_types).toBeDefined();
      // Should include built-in types
      expect(typeError!.structured.available_types).toContain("Int");
      expect(typeError!.structured.available_types).toContain("String");
    });
  });

  describe("E2002 ArityMismatch", () => {
    test("generates repair for too few arguments", () => {
      const code = `
        fn add(a: Int, b: Int) -> Int { a + b }
        fn main() -> Int { add(1) }
      `;
      const result = compileWithRepairs(code);

      // Should have the arity mismatch error
      const arityError = result.diagnostics.find((d) => d.code === "E2002");
      expect(arityError).toBeDefined();

      // Should have generated repair to add placeholder
      const repair = result.repairs.find((r) => r.title.includes("placeholder"));
      expect(repair).toBeDefined();
      expect(repair!.confidence).toBe("medium");
      expect(repair!.safety).toBe("behavior_changing");
    });

    test("generates repair for too many arguments", () => {
      const code = `
        fn double(x: Int) -> Int { x * 2 }
        fn main() -> Int { double(1, 2, 3) }
      `;
      const result = compileWithRepairs(code);

      // Should have the arity mismatch error
      const arityError = result.diagnostics.find((d) => d.code === "E2002");
      expect(arityError).toBeDefined();

      // Should have generated repair to remove extra arguments
      const repair = result.repairs.find((r) => r.title.includes("Remove"));
      expect(repair).toBeDefined();
      expect(repair!.confidence).toBe("medium");
    });
  });

  describe("no repairs for valid code", () => {
    test("no repairs generated for valid pure function", () => {
      const code = `
        fn add(a: Int, b: Int) -> Int { a + b }
      `;
      const result = compileWithRepairs(code);

      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(result.repairs).toHaveLength(0);
    });

    test("no repairs generated for valid IO function", () => {
      const code = `
        fn greet() -> IO + Unit {
          println("hello")
        }
      `;
      const result = compileWithRepairs(code);

      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(result.repairs).toHaveLength(0);
    });

    test("no repairs generated for valid mutable variable", () => {
      const code = `
        fn main() -> Unit {
          let mut x = 1
          x = 2
        }
      `;
      const result = compileWithRepairs(code);

      expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
      expect(result.repairs).toHaveLength(0);
    });
  });
});
