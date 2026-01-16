/**
 * Diagnostic Formatter
 *
 * Formats diagnostics for output as JSON or human-readable text.
 */

import type { CompileResult, Diagnostic } from "./diagnostic";
import type { SourceFile } from "../utils/source";

/**
 * JSON replacer that converts BigInt to string.
 * BigInt values appear in AST literal nodes (integer values).
 */
function bigIntReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value;
}

/**
 * Format compilation result as JSON.
 */
export function formatJson(result: CompileResult): string {
  return JSON.stringify(result, bigIntReplacer, 2);
}

/**
 * Format compilation result as compact JSON (single line).
 */
export function formatJsonCompact(result: CompileResult): string {
  return JSON.stringify(result, bigIntReplacer);
}

/**
 * Format diagnostics as human-readable text with source snippets.
 */
export function formatPretty(
  diagnostics: Diagnostic[],
  source: SourceFile
): string {
  const lines: string[] = [];

  for (const diag of diagnostics) {
    lines.push(formatDiagnostic(diag, source));
    lines.push("");
  }

  // Summary
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter(
    (d) => d.severity === "warning"
  ).length;

  if (errorCount > 0 || warningCount > 0) {
    const parts: string[] = [];
    if (errorCount > 0) {
      parts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
    }
    if (warningCount > 0) {
      parts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
    }
    lines.push(parts.join(", "));
  }

  return lines.join("\n");
}

/**
 * Format a single diagnostic with source context.
 */
function formatDiagnostic(diag: Diagnostic, source: SourceFile): string {
  const lines: string[] = [];
  const loc = diag.location;

  // Header: severity[code]: message
  const severityLabel = formatSeverity(diag.severity);
  lines.push(`${severityLabel}[${diag.code}]: ${diag.message}`);

  // Location: --> file:line:column
  lines.push(`  --> ${loc.file}:${loc.start.line}:${loc.start.column}`);

  // Source context
  const lineNum = loc.start.line;
  const lineNumWidth = Math.max(3, String(lineNum).toString().length);
  const gutter = " ".repeat(lineNumWidth);

  lines.push(`${gutter} |`);

  // Show the source line
  const sourceLine = source.getLine(lineNum);
  if (sourceLine !== null) {
    const lineNumStr = String(lineNum).padStart(lineNumWidth);
    lines.push(`${lineNumStr} | ${sourceLine}`);

    // Underline the error location
    const startCol = loc.start.column;
    const endCol =
      loc.start.line === loc.end.line ? loc.end.column : sourceLine.length + 1;
    const underlineLength = Math.max(1, endCol - startCol);
    const underline =
      " ".repeat(startCol - 1) + "^".repeat(underlineLength);
    lines.push(`${gutter} | ${underline}`);
  }

  // Show hints
  for (const hint of diag.hints) {
    lines.push(`${gutter} = help: ${hint.description}`);
    if (hint.template) {
      lines.push(`${gutter}         ${hint.template}`);
    }
  }

  // Show related information
  for (const related of diag.related) {
    lines.push(
      `${gutter} = note: ${related.message} (${related.location.file}:${related.location.start.line})`
    );
  }

  return lines.join("\n");
}

/**
 * Format severity as a colored/styled label.
 */
function formatSeverity(severity: Diagnostic["severity"]): string {
  switch (severity) {
    case "error":
      return "error";
    case "warning":
      return "warning";
    case "info":
      return "info";
    case "hint":
      return "hint";
  }
}

/**
 * Format diagnostics as a simple list (no source context).
 */
export function formatSimple(diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((d) => {
      const loc = d.location;
      return `${loc.file}:${loc.start.line}:${loc.start.column}: ${d.severity}[${d.code}]: ${d.message}`;
    })
    .join("\n");
}

/**
 * Create a summary line for compilation result.
 */
export function formatSummary(result: CompileResult): string {
  const { stats, diagnostics } = result;
  const errorCount = diagnostics.filter((d) => d.severity === "error").length;
  const warningCount = diagnostics.filter(
    (d) => d.severity === "warning"
  ).length;

  const parts: string[] = [];

  if (result.status === "success") {
    parts.push(`Compiled successfully`);
  } else if (result.status === "error") {
    parts.push(`Compilation failed`);
  } else {
    parts.push(`Compilation incomplete`);
  }

  if (errorCount > 0) {
    parts.push(`${errorCount} error${errorCount === 1 ? "" : "s"}`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning${warningCount === 1 ? "" : "s"}`);
  }

  parts.push(`in ${stats.compileTimeMs.toFixed(0)}ms`);

  return parts.join(" | ");
}
