/**
 * Diagnostic Collector
 *
 * Collects diagnostics during compilation and provides filtering/sorting.
 */

import type { SourceSpan } from "../utils/span";
import type {
  Diagnostic,
  Severity,
  StructuredData,
  Hint,
  RelatedInfo,
} from "./diagnostic";

let collectorDiagnosticIdCounter = 0;

function generateCollectorDiagnosticId(): string {
  return `d${++collectorDiagnosticIdCounter}`;
}

export function resetCollectorDiagnosticIdCounter(): void {
  collectorDiagnosticIdCounter = 0;
}

export class DiagnosticCollector {
  private diagnostics: Diagnostic[] = [];

  /**
   * Add a diagnostic to the collection.
   */
  add(diagnostic: Diagnostic): void {
    this.diagnostics.push(diagnostic);
  }

  /**
   * Create and add an error diagnostic.
   */
  error(
    code: string,
    message: string,
    location: SourceSpan,
    structured: StructuredData = { kind: "general" },
    hints: Hint[] = [],
    related: RelatedInfo[] = [],
    primary_node_id?: string
  ): void {
    this.add({
      id: generateCollectorDiagnosticId(),
      severity: "error",
      code,
      message,
      location,
      primary_node_id,
      structured,
      hints,
      related,
      repair_refs: [],
    });
  }

  /**
   * Create and add a warning diagnostic.
   */
  warning(
    code: string,
    message: string,
    location: SourceSpan,
    structured: StructuredData = { kind: "general" },
    hints: Hint[] = [],
    related: RelatedInfo[] = [],
    primary_node_id?: string
  ): void {
    this.add({
      id: generateCollectorDiagnosticId(),
      severity: "warning",
      code,
      message,
      location,
      primary_node_id,
      structured,
      hints,
      related,
      repair_refs: [],
    });
  }

  /**
   * Create and add an info diagnostic.
   */
  info(
    code: string,
    message: string,
    location: SourceSpan,
    structured: StructuredData = { kind: "general" },
    primary_node_id?: string
  ): void {
    this.add({
      id: generateCollectorDiagnosticId(),
      severity: "info",
      code,
      message,
      location,
      primary_node_id,
      structured,
      hints: [],
      related: [],
      repair_refs: [],
    });
  }

  /**
   * Get all diagnostics.
   */
  getAll(): Diagnostic[] {
    return [...this.diagnostics];
  }

  /**
   * Get diagnostics filtered by severity.
   */
  getBySeverity(severity: Severity): Diagnostic[] {
    return this.diagnostics.filter((d) => d.severity === severity);
  }

  /**
   * Get all errors.
   */
  getErrors(): Diagnostic[] {
    return this.getBySeverity("error");
  }

  /**
   * Get all warnings.
   */
  getWarnings(): Diagnostic[] {
    return this.getBySeverity("warning");
  }

  /**
   * Check if there are any errors.
   */
  hasErrors(): boolean {
    return this.diagnostics.some((d) => d.severity === "error");
  }

  /**
   * Check if there are any warnings.
   */
  hasWarnings(): boolean {
    return this.diagnostics.some((d) => d.severity === "warning");
  }

  /**
   * Get the number of diagnostics.
   */
  count(): number {
    return this.diagnostics.length;
  }

  /**
   * Get the number of errors.
   */
  errorCount(): number {
    return this.getErrors().length;
  }

  /**
   * Get the number of warnings.
   */
  warningCount(): number {
    return this.getWarnings().length;
  }

  /**
   * Clear all diagnostics.
   */
  clear(): void {
    this.diagnostics = [];
  }

  /**
   * Sort diagnostics by location (file, then line, then column).
   */
  sorted(): Diagnostic[] {
    return [...this.diagnostics].sort((a, b) => {
      // First by file
      const fileCompare = a.location.file.localeCompare(b.location.file);
      if (fileCompare !== 0) return fileCompare;

      // Then by line
      if (a.location.start.line !== b.location.start.line) {
        return a.location.start.line - b.location.start.line;
      }

      // Then by column
      return a.location.start.column - b.location.start.column;
    });
  }

  /**
   * Merge another collector into this one.
   */
  merge(other: DiagnosticCollector): void {
    for (const d of other.getAll()) {
      this.add(d);
    }
  }
}
