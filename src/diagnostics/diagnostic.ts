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
  /** Unique ID for this diagnostic instance */
  id: string;
  severity: Severity;
  code: string;
  message: string;
  location: SourceSpan;
  /** Primary AST node associated with this diagnostic */
  primary_node_id?: string | undefined;
  structured: StructuredData;
  hints: Hint[];
  related: RelatedInfo[];
  /** References to repair candidates that address this diagnostic */
  repair_refs: string[];
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
  /** Primary AST node that generated this obligation */
  primary_node_id?: string | undefined;
  context: ObligationContext;
  hints: Hint[];
  solverAttempted: boolean;
  /**
   * Result of the solver attempt:
   * - "discharged": Predicate was proven true
   * - "refuted": Predicate was proven false (counterexample available)
   * - "unknown": Could not prove or disprove (candidate counterexample may be available)
   */
  solverResult?: "discharged" | "refuted" | "unknown" | undefined;
  /** Why the solver returned "unknown" - for debugging and repair generation */
  unknown_reason?: string | undefined;
  /**
   * Counterexample showing variable assignments that violate the predicate.
   * For "refuted": definite counterexample
   * For "unknown": candidate counterexample that might violate the predicate
   */
  counterexample?: Record<string, string> | undefined;
  /** References to repair candidates that could discharge this obligation */
  repair_refs: string[];
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
  /** AST node ID for the hole expression */
  node_id?: string | undefined;
  expectedType: string;
  context: { bindings: BindingInfo[] };
  /** Effects allowed in this context (for fill candidates to respect) */
  allowed_effects: string[];
  /** Candidate expressions that could fill this hole */
  fill_candidates: FillCandidate[];
  /** References to repair candidates that could fill this hole */
  repair_refs: string[];
}

/**
 * A candidate expression that could fill a type hole.
 */
export interface FillCandidate {
  /** The expression AST that would fill the hole */
  expr: unknown;
  /** Confidence that this is the right fill */
  confidence: "high" | "medium" | "low";
  /** Human-readable description */
  description: string;
}

// =============================================================================
// Compilation Result
// =============================================================================

export interface CompileResult {
  status: "success" | "error" | "incomplete";
  compilerVersion: string;
  /** The canonical (possibly rewritten) AST - includes desugaring, explicit effects, etc. */
  canonical_ast?: unknown | undefined;
  output?: CompileOutput | undefined;
  diagnostics: Diagnostic[];
  obligations: Obligation[];
  holes: TypeHole[];
  /** Ranked repair suggestions - the key feature for agent interaction */
  repairs: RepairCandidate[];
  stats: CompileStats;
}

export interface CompileOutput {
  js?: string | undefined;
  ts?: string | undefined;
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
// Repair System Types
// =============================================================================

/**
 * Safety classification for repairs.
 * - behavior_preserving: Semantics unchanged (e.g., adding type annotation)
 * - likely_preserving: High confidence semantics unchanged (e.g., guard insertion)
 * - behavior_changing: May alter runtime behavior (e.g., changing logic)
 */
export type RepairSafety = "behavior_preserving" | "likely_preserving" | "behavior_changing";

/**
 * Confidence level for a repair.
 */
export type RepairConfidence = "high" | "medium" | "low";

/**
 * Category of repair.
 */
export type RepairKind = "local_fix" | "refactor" | "boundary_validation" | "semantics_change";

/**
 * Scope of a repair.
 */
export interface RepairScope {
  /** How many AST nodes are touched */
  node_count: number;
  /** Does it affect multiple functions? */
  crosses_function: boolean;
}

/**
 * What a repair targets.
 */
export interface RepairTargets {
  /** AST nodes affected */
  node_ids?: string[] | undefined;
  /** Diagnostic codes this should resolve */
  diagnostic_codes?: string[] | undefined;
  /** Obligation IDs this should discharge */
  obligation_ids?: string[] | undefined;
  /** Hole IDs this should fill */
  hole_ids?: string[] | undefined;
}

/**
 * What should change after applying a repair.
 */
export interface RepairExpectedDelta {
  /** Diagnostic IDs that should disappear */
  diagnostics_resolved: string[];
  /** Obligation IDs that should be satisfied */
  obligations_discharged: string[];
  /** Hole IDs that should be filled */
  holes_filled: string[];
}

/**
 * A precondition that must hold for a repair to be valid.
 */
export interface RepairPrecondition {
  /** Description of the precondition */
  description: string;
  /** Node IDs this depends on */
  depends_on?: string[] | undefined;
}

/**
 * A repair candidate that agents can apply to fix issues.
 */
export interface RepairCandidate {
  /** Unique identifier */
  id: string;
  /** Short label for the fix */
  title: string;
  /** How confident the compiler is this is the right fix */
  confidence: RepairConfidence;
  /** Safety classification */
  safety: RepairSafety;
  /** Category of repair */
  kind: RepairKind;
  /** Scope of the repair */
  scope: RepairScope;
  /** What this repair targets */
  targets: RepairTargets;
  /** The actual edits to apply */
  edits: PatchOp[];
  /** What should change after applying (REQUIRED) */
  expected_delta: RepairExpectedDelta;
  /** Human-readable explanation */
  rationale: string;
  /** Optional preconditions */
  preconditions?: RepairPrecondition[] | undefined;
}

/**
 * Patch operations for editing AST nodes.
 */
export type PatchOp =
  /** Replace an entire node with a new node */
  | { op: "replace_node"; node_id: string; new_node: unknown }
  /** Insert a statement before another */
  | { op: "insert_before"; target_id: string; new_statement: unknown }
  /** Insert a statement after another */
  | { op: "insert_after"; target_id: string; new_statement: unknown }
  /** Wrap a node in a new construct */
  | { op: "wrap"; node_id: string; wrapper: unknown; hole_ref: string }
  /** Delete a node */
  | { op: "delete_node"; node_id: string }
  /** Add a field to a record type */
  | { op: "add_field"; type_id: string; field: unknown }
  /** Add a parameter to a function */
  | { op: "add_param"; fn_id: string; param: unknown; position?: number | undefined }
  /** Add a refinement predicate to a type */
  | { op: "add_refinement"; type_id: string; predicate: unknown }
  /** Widen a function's effect annotation */
  | { op: "widen_effect"; fn_id: string; add_effects: string[] }
  /** Rename a symbol */
  | { op: "rename"; symbol_id: string; new_name: string }
  /** Rename a symbol (identifier) to a different name */
  | { op: "rename_symbol"; node_id: string; old_name: string; new_name: string }
  /** Rename a field access to a different field name */
  | { op: "rename_field"; node_id: string; old_name: string; new_name: string };

// =============================================================================
// Helper Functions
// =============================================================================

let diagnosticIdCounter = 0;

/**
 * Generate a unique diagnostic ID.
 */
function generateDiagnosticId(): string {
  return `d${++diagnosticIdCounter}`;
}

/**
 * Reset the diagnostic ID counter (call at start of compilation).
 */
export function resetDiagnosticIdCounter(): void {
  diagnosticIdCounter = 0;
}

export function createDiagnostic(
  severity: Severity,
  code: string,
  message: string,
  location: SourceSpan,
  structured: StructuredData = { kind: "general" },
  hints: Hint[] = [],
  related: RelatedInfo[] = [],
  primary_node_id?: string
): Diagnostic {
  return {
    id: generateDiagnosticId(),
    severity,
    code,
    message,
    location,
    primary_node_id,
    structured,
    hints,
    related,
    repair_refs: [], // Repairs are added by the repair generator
  };
}

export function isError(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === "error";
}

export function isWarning(diagnostic: Diagnostic): boolean {
  return diagnostic.severity === "warning";
}
