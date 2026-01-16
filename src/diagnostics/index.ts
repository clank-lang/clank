/**
 * Axon Diagnostics Module
 *
 * Provides structured error reporting with source locations,
 * hints, and machine-readable output for LLM consumption.
 */

export type {
  Severity,
  Diagnostic,
  StructuredData,
  Hint,
  RelatedInfo,
  Obligation,
  ObligationContext,
  BindingInfo,
  FactInfo,
  TypeHole,
  FillCandidate,
  CompileResult,
  CompileOutput,
  CompileStats,
  // Repair system types
  RepairSafety,
  RepairConfidence,
  RepairKind,
  RepairScope,
  RepairTargets,
  RepairExpectedDelta,
  RepairPrecondition,
  RepairCandidate,
  PatchOp,
} from "./diagnostic";

export {
  createDiagnostic,
  isError,
  isWarning,
  resetDiagnosticIdCounter,
} from "./diagnostic";

export { ErrorCode, getErrorDescription, getCodeSeverity } from "./codes";
export type { ErrorCodeType } from "./codes";

export { DiagnosticCollector, resetCollectorDiagnosticIdCounter } from "./collector";

export {
  formatJson,
  formatJsonCompact,
  formatPretty,
  formatSimple,
  formatSummary,
} from "./formatter";
