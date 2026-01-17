/**
 * Golden Test Helpers
 *
 * Utilities for loading, compiling, and verifying golden test fixtures.
 */

import { deserializeProgram } from "../../src/ast-json/deserialize";
import { typecheck } from "../../src/types";
import { emitTS } from "../../src/codegen";
import { generateRepairs, type RepairResult } from "../../src/diagnostics/repairs";
import type {
  Diagnostic,
  Obligation,
  RepairCandidate,
  RepairConfidence,
  RepairSafety,
  RepairKind,
  PatchOp,
} from "../../src/diagnostics/diagnostic";
import type { Program } from "../../src/parser/ast";
import { join } from "path";

// =============================================================================
// Types
// =============================================================================

export interface GoldenTestResult {
  success: boolean;
  program?: Program;
  tsCode?: string;
  diagnostics: Diagnostic[];
  obligations: Obligation[];
  repairs: RepairCandidate[];
  deserializeErrors?: { message: string; path: string }[];
}

export interface ExpectedRepair {
  /** Error code this repair should address (E2015, E4001, etc.) */
  forError: string;
  /** Substring that should appear in the repair title */
  titleContains: string;
  /** Expected confidence level */
  confidence: RepairConfidence;
  /** Expected safety classification */
  safety: RepairSafety;
  /** Expected repair kind */
  kind: RepairKind;
  /** Expected edit operation type (rename_field, widen_effect, etc.) */
  editOp: string;
}

export interface VerifyResult {
  success: boolean;
  failures: string[];
  matched: ExpectedRepair[];
}

// =============================================================================
// Fixture Path Helpers
// =============================================================================

const FIXTURES_DIR = join(import.meta.dir, "fixtures");

/**
 * Get the path to a fixture's main app.json.
 */
export function appPath(fixtureName: string): string {
  return join(FIXTURES_DIR, fixtureName, "app.json");
}

/**
 * Get the path to a broken fixture variant.
 */
export function brokenPath(fixtureName: string, variant: number): string {
  return join(FIXTURES_DIR, fixtureName, `app.broken-${variant}.json`);
}

// =============================================================================
// Load and Compile
// =============================================================================

/**
 * Load a JSON AST file and compile it through the Clank compiler pipeline.
 * Returns the compilation result including TypeScript output, diagnostics,
 * obligations, and repairs.
 */
export async function loadAndCompile(fixturePath: string): Promise<GoldenTestResult> {
  // Read the JSON file
  const jsonContent = await Bun.file(fixturePath).text();

  // Deserialize the AST
  const deserResult = deserializeProgram(jsonContent);
  if (!deserResult.ok || !deserResult.value) {
    return {
      success: false,
      diagnostics: [],
      obligations: [],
      repairs: [],
      deserializeErrors: deserResult.errors,
    };
  }

  const program = deserResult.value;

  // Type check
  const { diagnostics, obligations } = typecheck(program);

  // Generate repairs
  const repairResult = generateRepairs({
    program,
    diagnostics,
    obligations,
    holes: [],
  });

  // Backfill repair_refs on diagnostics
  for (const [diagId, repairIds] of repairResult.diagnosticRepairs) {
    const diag = diagnostics.find((d) => d.id === diagId);
    if (diag) {
      diag.repair_refs = repairIds;
    }
  }

  // Backfill repair_refs on obligations
  for (const [oblId, repairIds] of repairResult.obligationRepairs) {
    const obl = obligations.find((o) => o.id === oblId);
    if (obl) {
      obl.repair_refs = repairIds;
    }
  }

  // Check for errors
  const hasErrors = diagnostics.some((d) => d.severity === "error");
  const hasUnresolvedObligations = obligations.some(
    (o) => o.solverResult !== "discharged"
  );

  if (hasErrors || hasUnresolvedObligations) {
    return {
      success: false,
      program,
      diagnostics,
      obligations,
      repairs: repairResult.repairs,
    };
  }

  // Emit TypeScript
  const { code: tsCode } = emitTS(program, { includeRuntime: false });

  return {
    success: true,
    program,
    tsCode,
    diagnostics,
    obligations,
    repairs: repairResult.repairs,
  };
}

// =============================================================================
// Repair Verification
// =============================================================================

/**
 * Verify that the generated repairs match the expected patterns.
 */
export function verifyRepairs(
  repairs: RepairCandidate[],
  diagnostics: Diagnostic[],
  expected: ExpectedRepair[]
): VerifyResult {
  const failures: string[] = [];
  const matched: ExpectedRepair[] = [];

  for (const exp of expected) {
    // Find a diagnostic with the expected error code
    const diag = diagnostics.find((d) => d.code === exp.forError);
    if (!diag) {
      failures.push(`No diagnostic found with code ${exp.forError}`);
      continue;
    }

    // Find repairs that target this diagnostic
    const relevantRepairs = repairs.filter((r) =>
      r.targets.diagnostic_codes?.includes(exp.forError) ||
      diag.repair_refs.includes(r.id)
    );

    if (relevantRepairs.length === 0) {
      failures.push(`No repairs found for ${exp.forError}`);
      continue;
    }

    // Find a repair matching all expected attributes
    const matchingRepair = relevantRepairs.find((r) => {
      // Title must contain expected substring
      if (!r.title.toLowerCase().includes(exp.titleContains.toLowerCase())) {
        return false;
      }
      // Confidence must match
      if (r.confidence !== exp.confidence) {
        return false;
      }
      // Safety must match
      if (r.safety !== exp.safety) {
        return false;
      }
      // Kind must match
      if (r.kind !== exp.kind) {
        return false;
      }
      // Edit operation must be present
      const hasExpectedOp = r.edits.some((edit) => edit.op === exp.editOp);
      if (!hasExpectedOp) {
        return false;
      }
      return true;
    });

    if (!matchingRepair) {
      const details = relevantRepairs.map((r) => ({
        title: r.title,
        confidence: r.confidence,
        safety: r.safety,
        kind: r.kind,
        ops: r.edits.map((e) => e.op),
      }));
      failures.push(
        `No repair matching expected pattern for ${exp.forError}:\n` +
          `  Expected: title contains "${exp.titleContains}", ` +
          `confidence=${exp.confidence}, safety=${exp.safety}, ` +
          `kind=${exp.kind}, editOp=${exp.editOp}\n` +
          `  Found: ${JSON.stringify(details, null, 2)}`
      );
      continue;
    }

    matched.push(exp);
  }

  return {
    success: failures.length === 0,
    failures,
    matched,
  };
}

// =============================================================================
// Diagnostic Helpers
// =============================================================================

/**
 * Check if a specific error code is present in diagnostics.
 */
export function hasErrorCode(diagnostics: Diagnostic[], code: string): boolean {
  return diagnostics.some((d) => d.code === code && d.severity === "error");
}

/**
 * Get all error codes from diagnostics.
 */
export function getErrorCodes(diagnostics: Diagnostic[]): string[] {
  return diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => d.code);
}

/**
 * Get human-readable error summary.
 */
export function summarizeErrors(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((d) => d.severity === "error");
  if (errors.length === 0) return "No errors";
  return errors.map((e) => `${e.code}: ${e.message}`).join("\n");
}

/**
 * Get human-readable obligation summary.
 */
export function summarizeObligations(obligations: Obligation[]): string {
  if (obligations.length === 0) return "No obligations";
  return obligations
    .map(
      (o) =>
        `${o.id}: ${o.goal} (${o.solverResult ?? "not attempted"})`
    )
    .join("\n");
}
