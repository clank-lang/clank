/**
 * Type Expression Converter
 *
 * Converts AST TypeExpr nodes to semantic Type values.
 */

import type { TypeExpr } from "../parser/ast";
import type { SourceSpan } from "../utils/span";
import type { Type, RefinementPredicate, RefinementTerm } from "./types";
import type { TypeContext } from "./context";
import {
  TYPE_INT,
  TYPE_INT32,
  TYPE_INT64,
  TYPE_NAT,
  TYPE_FLOAT,
  TYPE_BOOL,
  TYPE_STR,
  TYPE_UNIT,
  TYPE_NEVER,
  freshTypeVar,
  typeCon,
  typeApp,
  typeFn,
  typeTuple,
  typeArray,
  typeRecord,
  typeRefined,
} from "./types";
import { DiagnosticCollector, ErrorCode } from "../diagnostics";
import { extractPredicate } from "../refinements";

// =============================================================================
// Built-in Type Names
// =============================================================================

const BUILTIN_TYPES: Record<string, Type> = {
  // Integer types
  Int: TYPE_INT,
  "\u2124": TYPE_INT, // ℤ
  Int32: TYPE_INT32,
  "\u212432": TYPE_INT32, // ℤ32
  Int64: TYPE_INT64,
  "\u212464": TYPE_INT64, // ℤ64
  Nat: TYPE_NAT,
  "\u2115": TYPE_NAT, // ℕ

  // Other primitives
  Float: TYPE_FLOAT,
  "\u211D": TYPE_FLOAT, // ℝ
  Bool: TYPE_BOOL,
  Str: TYPE_STR,
  String: TYPE_STR,
  Unit: TYPE_UNIT,
  never: TYPE_NEVER,
};

// =============================================================================
// Conversion Functions
// =============================================================================

export interface ConvertOptions {
  /** Type parameter bindings (name -> type) */
  typeParams?: Map<string, Type> | undefined;
  /** Diagnostic collector for errors */
  diagnostics?: DiagnosticCollector | undefined;
}

/**
 * Convert an AST TypeExpr to a semantic Type.
 */
export function convertTypeExpr(
  expr: TypeExpr,
  ctx: TypeContext,
  options: ConvertOptions = {}
): Type {
  const { typeParams = new Map(), diagnostics } = options;

  switch (expr.kind) {
    case "named":
      return convertNamedType(expr, ctx, typeParams, diagnostics);

    case "array":
      return typeArray(
        convertTypeExpr(expr.element, ctx, options)
      );

    case "tuple":
      return typeTuple(
        expr.elements.map((e) => convertTypeExpr(e, ctx, options))
      );

    case "function":
      return typeFn(
        expr.params.map((p) => convertTypeExpr(p, ctx, options)),
        convertTypeExpr(expr.returnType, ctx, options)
      );

    case "recordType": {
      const fields = new Map<string, Type>();
      for (const field of expr.fields) {
        fields.set(field.name, convertTypeExpr(field.type, ctx, options));
      }
      return typeRecord(fields, expr.isOpen);
    }

    case "refined": {
      const base = convertTypeExpr(expr.base, ctx, options);
      const predicate = extractPredicate(expr.predicate);
      // Use explicit varName, or infer from predicate, or use default
      const varName =
        expr.varName ??
        extractPredicateVariable(predicate) ??
        defaultRefinementVar(expr.base);
      return typeRefined(base, varName, predicate);
    }

    case "effect":
      // Extract and convert the result type; effects are tracked separately
      // via extractEffectsFromTypeExpr for function return types
      return convertTypeExpr(expr.resultType, ctx, options);
  }
}

/**
 * Extract effect names from a TypeExpr.
 * Returns empty set if the type has no effects.
 */
export function extractEffectsFromTypeExpr(expr: TypeExpr): Set<string> {
  if (expr.kind !== "effect") {
    return new Set();
  }

  const effects = new Set<string>();
  for (const effectExpr of expr.effects) {
    const name = getEffectName(effectExpr);
    if (name) {
      effects.add(name);
    }
  }
  return effects;
}

/**
 * Extract the effect name from a type expression.
 * IO, Async, Err, Mut are the valid effect names.
 */
function getEffectName(expr: TypeExpr): string | null {
  if (expr.kind === "named") {
    const validEffects = ["IO", "Async", "Err", "Mut"];
    if (validEffects.includes(expr.name)) {
      return expr.name;
    }
  }
  return null;
}

/**
 * Convert a named type expression.
 */
function convertNamedType(
  expr: { kind: "named"; name: string; args: TypeExpr[]; span: SourceSpan },
  ctx: TypeContext,
  typeParams: Map<string, Type>,
  diagnostics?: DiagnosticCollector
): Type {
  const name = expr.name;

  // Check if it's a type parameter
  const typeParam = typeParams.get(name) ?? ctx.lookupTypeParam(name);
  if (typeParam) {
    if (expr.args.length > 0) {
      diagnostics?.error(
        ErrorCode.TypeParamMismatch,
        `Type parameter '${name}' does not take arguments`,
        expr.span,
        { kind: "type_param_mismatch", name }
      );
    }
    return typeParam;
  }

  // Check if it's a built-in type
  const builtin = BUILTIN_TYPES[name];
  if (builtin) {
    if (expr.args.length > 0) {
      diagnostics?.error(
        ErrorCode.TypeParamMismatch,
        `Built-in type '${name}' does not take type arguments`,
        expr.span,
        { kind: "type_param_mismatch", name }
      );
    }
    return builtin;
  }

  // Check for well-known generic types (including effect types)
  const wellKnownGenerics = ["Option", "Result", "Map", "Set", "IO", "Async", "Err", "Mut"];
  if (wellKnownGenerics.includes(name)) {
    const con = typeCon(name);
    if (expr.args.length === 0) {
      // Allow without args - they'll be inferred
      return con;
    }
    const args = expr.args.map((a) =>
      convertTypeExpr(a, ctx, { typeParams, diagnostics })
    );
    return typeApp(con, args);
  }

  // Look up in context
  const typeDef = ctx.lookupType(name);
  if (typeDef) {
    // Validate type argument count
    if (expr.args.length !== typeDef.typeParams.length) {
      diagnostics?.error(
        ErrorCode.TypeParamMismatch,
        `Type '${name}' expects ${typeDef.typeParams.length} type arguments, got ${expr.args.length}`,
        expr.span,
        {
          kind: "type_param_mismatch",
          name,
          expected: String(typeDef.typeParams.length),
          actual: String(expr.args.length),
        }
      );
    }

    const con = typeCon(name);
    if (expr.args.length === 0) {
      return con;
    }
    const args = expr.args.map((a) =>
      convertTypeExpr(a, ctx, { typeParams, diagnostics })
    );
    return typeApp(con, args);
  }

  // Unknown type - report error and return a fresh type variable
  diagnostics?.error(
    ErrorCode.UnresolvedType,
    `Unknown type '${name}'`,
    expr.span,
    { kind: "unresolved_type", name }
  );
  return freshTypeVar(name);
}

// =============================================================================
// Type Parameter Binding
// =============================================================================

/**
 * Create type parameter bindings from AST type parameters.
 */
export function bindTypeParams(
  params: { name: string; constraint?: TypeExpr | undefined }[],
  _ctx: TypeContext,
  _diagnostics?: DiagnosticCollector | undefined
): Map<string, Type> {
  const bindings = new Map<string, Type>();

  for (const param of params) {
    const typeVar = freshTypeVar(param.name);
    bindings.set(param.name, typeVar);

    // Note: We store constraints but don't validate them in MVP
    // In the future, constraints would be checked during unification
  }

  return bindings;
}

// =============================================================================
// Type Expression Utilities
// =============================================================================

/**
 * Check if a type expression represents Unit type.
 */
export function isUnitTypeExpr(expr: TypeExpr): boolean {
  return expr.kind === "named" && (expr.name === "Unit" || expr.name === "()");
}

/**
 * Check if a type expression represents Never type.
 */
export function isNeverTypeExpr(expr: TypeExpr): boolean {
  return expr.kind === "named" && expr.name === "never";
}

/**
 * Get the name of a type expression (for simple named types).
 */
export function getTypeExprName(expr: TypeExpr): string | null {
  if (expr.kind === "named") {
    return expr.name;
  }
  return null;
}

/**
 * Extract the first variable used in a predicate.
 * This is used to infer the refinement variable name when not explicitly specified.
 */
function extractPredicateVariable(pred: RefinementPredicate): string | null {
  switch (pred.kind) {
    case "compare":
      return extractTermVariable(pred.left) ?? extractTermVariable(pred.right);
    case "and":
    case "or":
      return extractPredicateVariable(pred.left) ?? extractPredicateVariable(pred.right);
    case "not":
      return extractPredicateVariable(pred.inner);
    case "call":
      for (const arg of pred.args) {
        const v = extractTermVariable(arg);
        if (v) return v;
      }
      return null;
    case "true":
    case "false":
    case "unknown":
      return null;
  }
}

/**
 * Extract the first variable from a term.
 */
function extractTermVariable(term: RefinementTerm): string | null {
  switch (term.kind) {
    case "var":
      return term.name;
    case "binop":
      return extractTermVariable(term.left) ?? extractTermVariable(term.right);
    case "call":
      for (const arg of term.args) {
        const v = extractTermVariable(arg);
        if (v) return v;
      }
      return null;
    case "field":
      return extractTermVariable(term.base);
    case "int":
    case "bool":
    case "string":
      return null;
  }
}

/**
 * Generate a default variable name for refinement predicates.
 * Uses conventional names like 'x' for scalars, 'arr' for arrays, etc.
 */
function defaultRefinementVar(typeExpr: TypeExpr): string {
  switch (typeExpr.kind) {
    case "named":
      // Use conventional single-letter names based on type
      switch (typeExpr.name) {
        case "Int":
        case "Int32":
        case "Int64":
        case "Nat":
        case "ℤ":
        case "ℕ":
          return "n";
        case "Float":
        case "ℝ":
          return "x";
        case "Bool":
          return "b";
        case "Str":
        case "String":
          return "s";
        default:
          return "x";
      }
    case "array":
      return "arr";
    case "tuple":
      return "t";
    case "function":
      return "f";
    case "recordType":
      return "r";
    default:
      return "x";
  }
}
