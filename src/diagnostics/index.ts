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
  CompileResult,
  CompileOutput,
  CompileStats,
} from "./diagnostic";

export { createDiagnostic, isError, isWarning } from "./diagnostic";

export { ErrorCode, getErrorDescription, getCodeSeverity } from "./codes";
export type { ErrorCodeType } from "./codes";

export { DiagnosticCollector } from "./collector";

export {
  formatJson,
  formatJsonCompact,
  formatPretty,
  formatSimple,
  formatSummary,
} from "./formatter";
