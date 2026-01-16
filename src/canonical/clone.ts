/**
 * AST Cloning
 *
 * Generic deep clone for AST nodes. Detects AST nodes by their structure
 * (having `id` and `span` fields) and generates fresh IDs for them.
 */

import type { Program } from "../parser/ast";
import { generateNodeId } from "../parser/ast";
import type { SourceSpan } from "../utils/span";

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a value is a SourceSpan.
 */
function isSpan(value: unknown): value is SourceSpan {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.file === "string" &&
    typeof obj.start === "object" &&
    obj.start !== null &&
    typeof obj.end === "object" &&
    obj.end !== null
  );
}

/**
 * Check if a value is an AST node (has id and span fields).
 */
function isAstNode(value: unknown): value is { id: string; span: SourceSpan; kind: string } {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.kind === "string" &&
    isSpan(obj.span)
  );
}

// =============================================================================
// Generic Deep Clone
// =============================================================================

/**
 * Deep clone any value, generating new IDs for AST nodes.
 */
function deepClone<T>(value: T): T {
  // Handle null and undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Handle primitives (string, number, boolean, bigint, symbol)
  if (typeof value !== "object") {
    return value;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(deepClone) as T;
  }

  // Handle AST nodes - generate new ID and clone span
  if (isAstNode(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      if (key === "id") {
        result.id = generateNodeId();
      } else if (key === "span") {
        result.span = cloneSpan(value.span);
      } else {
        result[key] = deepClone((value as Record<string, unknown>)[key]);
      }
    }
    return result as T;
  }

  // Handle spans (not AST nodes but need deep clone)
  if (isSpan(value)) {
    return cloneSpan(value) as T;
  }

  // Handle plain objects
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    result[key] = deepClone((value as Record<string, unknown>)[key]);
  }
  return result as T;
}

/**
 * Clone a source span.
 */
function cloneSpan(span: SourceSpan): SourceSpan {
  return {
    file: span.file,
    start: { ...span.start },
    end: { ...span.end },
  };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Clone an entire program, generating fresh node IDs.
 */
export function cloneProgram(program: Program): Program {
  return deepClone(program);
}

/**
 * Clone any AST node, generating fresh node IDs.
 */
export function cloneNode<T>(node: T): T {
  return deepClone(node);
}
