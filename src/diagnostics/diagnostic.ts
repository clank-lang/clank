/**
 * Diagnostic types for structured compiler output
 *
 * These types define the shape of compiler diagnostics, proof obligations,
 * and the overall compilation result structure.
 */

import type { SourceSpan } from "../utils/span";

// =============================================================================
// Core Diagnostic Types
// =============================================================================

export type Severity = "error" | "warning" | "info" | "hint";

export interface Diagnostic {
  severity: Severity;
  code: string;
  message: string;
  location: SourceSpan;
  structured: StructuredData;
  hints: Hint[];
  related: RelatedInfo[];
}

export interface StructuredData {
  kind: string;
  expected?: string | undefined;
  actual?: string | undefined;
  [key: string]: unknown;
}

export interface Hint {
  strategy: string;
  description: string;
  template?: string | undefined;
  confidence: "high" | "medium" | "low";
}

export interface RelatedInfo {
  message: string;
  location: SourceSpan;
}

// =============================================================================
// Proof Obligations (for refinement types - future use)
// =============================================================================

export interface Obligation {
  id: string;
  kind: "refinement" | "precondition" | "postcondition" | "effect" | "linearity";
  goal: string;
  location: SourceSpan;
  context: ObligationContext;
  hints: Hint[];
  solverAttempted: boolean;
  solverResult?: "discharged" | "unknown" | "counterexample" | undefined;
  counterexample?: Record<string, string> | undefined;
}

export interface ObligationContext {
  bindings: BindingInfo[];
  facts: FactInfo[];
}

export interface BindingInfo {
  name: string;
  type: string;
  mutable: boolean;
  source: string;
}

export interface FactInfo {
  proposition: string;
  source: string;
}

// =============================================================================
// Type Holes (for incomplete code)
// =============================================================================

export interface TypeHole {
  id: string;
  location: SourceSpan;
  expectedType: string;
  context: { bindings: BindingInfo[] };
}

// =============================================================================
// Compilation Result
// =============================================================================

export interface CompileResult {
  status: "success" | "error" | "incomplete";
  compilerVersion: string;
  output?: CompileOutput | undefined;
  diagnostics: Diagnostic[];
  obligations: Obligation[];
  holes: TypeHole[];
  stats: CompileStats;
}

export interface CompileOutput {
  js: string;
  jsMap?: string | undefined;
  dts?: string | undefined;
}

export interface CompileStats {
  sourceFiles: number;
  sourceLines: number;
  sourceTokens: number;
  outputLines: number;
  outputBytes: number;
  obligationsTotal: number;
  obligationsDischarged: number;
  compileTimeMs: number;
}

// =============================================================================
// Helper Functions
// =============================================================================

export function createDiagnostic(
  severity: Severity,
  code: string,
  message: string,
  location: SourceSpan,
  structured: StructuredData = { kind: "general" },
  hints: Hint[] = [],
  related: RelatedInfo[] = []
): Diagnostic {
  return { severity, code, message, location, structured, hints, related };
}

export function isError(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === "error";
}

export function isWarning(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === "warning";
}
