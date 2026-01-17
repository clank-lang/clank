/**
 * Exhaustiveness Checking for Match Expressions
 *
 * Determines whether a set of match arms covers all possible values
 * of the scrutinee type. Returns missing patterns for repair generation.
 */

import type { Pattern, MatchArm } from "../parser/ast";
import type { Type } from "./types";
import type { TypeContext, TypeDef } from "./context";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of exhaustiveness checking
 */
export interface ExhaustivenessResult {
  /** Whether the patterns are exhaustive */
  exhaustive: boolean;
  /** Missing patterns if not exhaustive */
  missing: MissingPattern[];
  /** Whether a wildcard/catch-all pattern was found */
  hasCatchAll: boolean;
}

/**
 * Description of a missing pattern for error messages and repairs
 */
export interface MissingPattern {
  /** Human-readable description of the missing pattern */
  description: string;
  /** The kind of missing pattern */
  kind: "variant" | "literal" | "other";
  /** For variants: the variant name */
  variantName?: string;
  /** For variants: the sum type name */
  typeName?: string;
  /** For variants: whether this variant has a payload */
  hasPayload?: boolean;
  /** For variants: field names if named fields */
  fieldNames?: string[];
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Check if a set of match arms is exhaustive for the given scrutinee type.
 *
 * @param arms - The match arms to check
 * @param scrutineeType - The type being matched on
 * @param ctx - Type context for looking up type definitions
 * @returns Result indicating exhaustiveness and missing patterns
 */
export function checkExhaustiveness(
  arms: MatchArm[],
  scrutineeType: Type,
  ctx: TypeContext
): ExhaustivenessResult {
  // Arms with guards are excluded from exhaustiveness analysis
  // because they may not match even if the pattern matches
  const unguardedArms = arms.filter((arm) => !arm.guard);
  const patterns = unguardedArms.map((arm) => arm.pattern);

  // Check for catch-all patterns first
  if (hasCatchAllPattern(patterns)) {
    return { exhaustive: true, missing: [], hasCatchAll: true };
  }

  // Expand type aliases and handle type applications
  const resolvedType = resolveType(scrutineeType, ctx);

  // Check based on the type kind
  return checkTypeExhaustiveness(patterns, resolvedType, ctx);
}

// =============================================================================
// Pattern Analysis
// =============================================================================

/**
 * Check if any pattern is a catch-all (wildcard or identifier binding)
 */
function hasCatchAllPattern(patterns: Pattern[]): boolean {
  return patterns.some((p) => p.kind === "wildcard" || p.kind === "ident");
}

/**
 * Resolve type aliases and extract base type information
 */
function resolveType(type: Type, ctx: TypeContext): Type {
  // Handle type application (e.g., Option[Int])
  if (type.kind === "app" && type.con.kind === "con") {
    return type;
  }

  // Handle type constructor
  if (type.kind === "con") {
    const typeDef = ctx.lookupType(type.name);
    if (typeDef?.kind === "alias" && typeDef.type) {
      return resolveType(typeDef.type, ctx);
    }
    return type;
  }

  // Handle refined types - check the base type
  if (type.kind === "refined") {
    return resolveType(type.base, ctx);
  }

  return type;
}

/**
 * Get the type definition for a type, handling type applications
 */
function getTypeDef(type: Type, ctx: TypeContext): TypeDef | null {
  if (type.kind === "con") {
    return ctx.lookupType(type.name) ?? null;
  }
  if (type.kind === "app" && type.con.kind === "con") {
    return ctx.lookupType(type.con.name) ?? null;
  }
  return null;
}

// =============================================================================
// Type-Specific Exhaustiveness Checking
// =============================================================================

function checkTypeExhaustiveness(
  patterns: Pattern[],
  type: Type,
  ctx: TypeContext
): ExhaustivenessResult {
  const typeDef = getTypeDef(type, ctx);

  // Check for sum types
  if (typeDef?.kind === "sum" && typeDef.variants) {
    return checkSumTypeExhaustiveness(patterns, typeDef);
  }

  // Check for Boolean
  if (type.kind === "con" && type.name === "Bool") {
    return checkBooleanExhaustiveness(patterns);
  }

  // Check for Unit type - any pattern matches
  if (type.kind === "con" && type.name === "Unit") {
    if (patterns.length > 0) {
      return { exhaustive: true, missing: [], hasCatchAll: false };
    }
    return {
      exhaustive: false,
      missing: [{ description: "()", kind: "literal" }],
      hasCatchAll: false,
    };
  }

  // Check for tuple types
  if (type.kind === "tuple") {
    return checkTupleExhaustiveness(patterns, type, ctx);
  }

  // For other types (Int, String, etc.), we cannot prove exhaustiveness
  // without literals covering all values (which is infinite)
  // Require a catch-all pattern
  return {
    exhaustive: false,
    missing: [{ description: "_", kind: "other" }],
    hasCatchAll: false,
  };
}

/**
 * Check exhaustiveness for sum types (variants)
 */
function checkSumTypeExhaustiveness(
  patterns: Pattern[],
  typeDef: TypeDef
): ExhaustivenessResult {
  if (!typeDef.variants) {
    return { exhaustive: true, missing: [], hasCatchAll: false };
  }

  // Collect all variant names from the type definition
  const allVariants = new Set(typeDef.variants.keys());

  // Collect covered variants from patterns
  const coveredVariants = new Set<string>();
  for (const pattern of patterns) {
    if (pattern.kind === "variant") {
      coveredVariants.add(pattern.name);
    }
  }

  // Find missing variants
  const missing: MissingPattern[] = [];
  for (const variantName of allVariants) {
    if (!coveredVariants.has(variantName)) {
      const variantDef = typeDef.variants.get(variantName);
      const hasPayload = variantDef ? variantDef.fields.length > 0 : false;

      const missingPattern: MissingPattern = {
        description: hasPayload ? `${variantName}(_)` : variantName,
        kind: "variant",
        variantName,
        typeName: typeDef.name,
        hasPayload,
      };
      if (variantDef?.fieldNames) {
        missingPattern.fieldNames = variantDef.fieldNames;
      }
      missing.push(missingPattern);
    }
  }

  return {
    exhaustive: missing.length === 0,
    missing,
    hasCatchAll: false,
  };
}

/**
 * Check exhaustiveness for Boolean type
 */
function checkBooleanExhaustiveness(patterns: Pattern[]): ExhaustivenessResult {
  let hasTrue = false;
  let hasFalse = false;

  for (const pattern of patterns) {
    if (pattern.kind === "literal" && pattern.value.kind === "bool") {
      if (pattern.value.value === true) hasTrue = true;
      if (pattern.value.value === false) hasFalse = true;
    }
  }

  const missing: MissingPattern[] = [];
  if (!hasTrue) {
    missing.push({ description: "true", kind: "literal" });
  }
  if (!hasFalse) {
    missing.push({ description: "false", kind: "literal" });
  }

  return {
    exhaustive: missing.length === 0,
    missing,
    hasCatchAll: false,
  };
}

/**
 * Check exhaustiveness for tuple types
 *
 * A tuple match is exhaustive if:
 * 1. There's a catch-all pattern, OR
 * 2. All tuple patterns together cover all combinations (complex, conservative)
 *
 * For simplicity, we require at least one tuple pattern or catch-all.
 * Full tuple exhaustiveness requires product analysis which is complex.
 */
function checkTupleExhaustiveness(
  patterns: Pattern[],
  _tupleType: Type,
  _ctx: TypeContext
): ExhaustivenessResult {
  // Check if there's any tuple pattern
  const hasTuplePattern = patterns.some((p) => p.kind === "tuple");

  if (!hasTuplePattern) {
    return {
      exhaustive: false,
      missing: [{ description: "(_, ...)", kind: "other" }],
      hasCatchAll: false,
    };
  }

  // Conservative: if we have tuple patterns but no catch-all,
  // we cannot easily prove exhaustiveness without full product analysis
  // For now, require explicit catch-all for complex tuple patterns
  return {
    exhaustive: false,
    missing: [{ description: "_", kind: "other" }],
    hasCatchAll: false,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format missing patterns as a human-readable list
 */
export function formatMissingPatterns(missing: MissingPattern[]): string {
  if (missing.length === 0) return "";
  if (missing.length === 1) return missing[0].description;
  if (missing.length === 2) {
    return `${missing[0].description} and ${missing[1].description}`;
  }

  const last = missing[missing.length - 1];
  const rest = missing.slice(0, -1);
  return `${rest.map((m) => m.description).join(", ")}, and ${last.description}`;
}

/**
 * Check if a pattern could potentially match a variant
 */
export function patternMatchesVariant(pattern: Pattern, variantName: string): boolean {
  if (pattern.kind === "wildcard" || pattern.kind === "ident") {
    return true;
  }
  if (pattern.kind === "variant") {
    return pattern.name === variantName;
  }
  return false;
}
