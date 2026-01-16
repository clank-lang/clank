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
