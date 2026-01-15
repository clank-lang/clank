/**
 * Type Unification
 *
 * Implements Hindley-Milner style unification for type inference.
 */

import type { Type, TypeVar, TypeFn, TypeApp, TypeTuple, TypeRecord } from "./types";
import { formatType } from "./types";

// =============================================================================
// Substitution
// =============================================================================

/**
 * A substitution maps type variable IDs to types.
 */
export type Substitution = Map<number, Type>;

/**
 * Create an empty substitution.
 */
export function emptySubst(): Substitution {
  return new Map();
}

/**
 * Create a singleton substitution.
 */
export function singletonSubst(varId: number, type: Type): Substitution {
  return new Map([[varId, type]]);
}

/**
 * Apply a substitution to a type, replacing type variables.
 */
export function applySubst(subst: Substitution, t: Type): Type {
  switch (t.kind) {
    case "var": {
      const resolved = subst.get(t.id);
      if (resolved) {
        // Recursively apply in case resolved type contains more variables
        return applySubst(subst, resolved);
      }
      return t;
    }

    case "con":
    case "never":
      return t;

    case "app":
      return {
        kind: "app",
        con: applySubst(subst, t.con),
        args: t.args.map((a) => applySubst(subst, a)),
      };

    case "fn":
      return {
        kind: "fn",
        params: t.params.map((p) => applySubst(subst, p)),
        returnType: applySubst(subst, t.returnType),
      };

    case "tuple":
      return {
        kind: "tuple",
        elements: t.elements.map((e) => applySubst(subst, e)),
      };

    case "array":
      return {
        kind: "array",
        element: applySubst(subst, t.element),
      };

    case "record": {
      const fields = new Map<string, Type>();
      for (const [k, v] of t.fields) {
        fields.set(k, applySubst(subst, v));
      }
      return { kind: "record", fields, isOpen: t.isOpen };
    }
  }
}

/**
 * Compose two substitutions: apply s1 then s2.
 */
export function composeSubst(s1: Substitution, s2: Substitution): Substitution {
  const result = new Map<number, Type>();

  // Apply s1 to all types in s2
  for (const [k, v] of s2) {
    result.set(k, applySubst(s1, v));
  }

  // Add bindings from s1 that aren't in s2
  for (const [k, v] of s1) {
    if (!result.has(k)) {
      result.set(k, v);
    }
  }

  return result;
}

// =============================================================================
// Unification Result
// =============================================================================

export interface UnifyError {
  kind: "type_mismatch" | "occurs_check" | "arity_mismatch" | "missing_field";
  expected: Type;
  actual: Type;
  message: string;
  details?: string | undefined;
}

export type UnifyResult =
  | { ok: true; subst: Substitution }
  | { ok: false; error: UnifyError };

// =============================================================================
// Occurs Check
// =============================================================================

/**
 * Check if a type variable occurs in a type (to prevent infinite types).
 */
function occurs(varId: number, t: Type): boolean {
  switch (t.kind) {
    case "var":
      return t.id === varId;
    case "con":
    case "never":
      return false;
    case "app":
      return occurs(varId, t.con) || t.args.some((a) => occurs(varId, a));
    case "fn":
      return (
        t.params.some((p) => occurs(varId, p)) || occurs(varId, t.returnType)
      );
    case "tuple":
      return t.elements.some((e) => occurs(varId, e));
    case "array":
      return occurs(varId, t.element);
    case "record":
      return Array.from(t.fields.values()).some((v) => occurs(varId, v));
  }
}

// =============================================================================
// Unification Algorithm
// =============================================================================

/**
 * Unify two types, returning a substitution that makes them equal.
 */
export function unify(t1: Type, t2: Type): UnifyResult {
  // Same type (by reference)
  if (t1 === t2) {
    return { ok: true, subst: emptySubst() };
  }

  // Type variable on the left
  if (t1.kind === "var") {
    return unifyVar(t1, t2);
  }

  // Type variable on the right
  if (t2.kind === "var") {
    return unifyVar(t2, t1);
  }

  // Never type unifies with anything (bottom type)
  if (t1.kind === "never") {
    return { ok: true, subst: emptySubst() };
  }
  if (t2.kind === "never") {
    return { ok: true, subst: emptySubst() };
  }

  // Type constructors
  if (t1.kind === "con" && t2.kind === "con") {
    if (t1.name === t2.name) {
      return { ok: true, subst: emptySubst() };
    }
    return {
      ok: false,
      error: {
        kind: "type_mismatch",
        expected: t1,
        actual: t2,
        message: `Type mismatch: expected ${formatType(t1)}, got ${formatType(t2)}`,
      },
    };
  }

  // Type applications
  if (t1.kind === "app" && t2.kind === "app") {
    return unifyApp(t1, t2);
  }

  // Function types
  if (t1.kind === "fn" && t2.kind === "fn") {
    return unifyFn(t1, t2);
  }

  // Tuple types
  if (t1.kind === "tuple" && t2.kind === "tuple") {
    return unifyTuple(t1, t2);
  }

  // Array types
  if (t1.kind === "array" && t2.kind === "array") {
    return unify(t1.element, t2.element);
  }

  // Record types
  if (t1.kind === "record" && t2.kind === "record") {
    return unifyRecord(t1, t2);
  }

  // No match
  return {
    ok: false,
    error: {
      kind: "type_mismatch",
      expected: t1,
      actual: t2,
      message: `Type mismatch: expected ${formatType(t1)}, got ${formatType(t2)}`,
    },
  };
}

/**
 * Unify a type variable with another type.
 */
function unifyVar(v: TypeVar, t: Type): UnifyResult {
  // Same variable
  if (t.kind === "var" && v.id === t.id) {
    return { ok: true, subst: emptySubst() };
  }

  // Occurs check
  if (occurs(v.id, t)) {
    return {
      ok: false,
      error: {
        kind: "occurs_check",
        expected: v,
        actual: t,
        message: `Infinite type: ${formatType(v)} occurs in ${formatType(t)}`,
      },
    };
  }

  // Bind the variable
  return { ok: true, subst: singletonSubst(v.id, t) };
}

/**
 * Unify two type applications.
 */
function unifyApp(t1: TypeApp, t2: TypeApp): UnifyResult {
  // First unify the constructors
  const conResult = unify(t1.con, t2.con);
  if (!conResult.ok) return conResult;

  // Check arity
  if (t1.args.length !== t2.args.length) {
    return {
      ok: false,
      error: {
        kind: "arity_mismatch",
        expected: t1,
        actual: t2,
        message: `Type argument count mismatch: expected ${t1.args.length}, got ${t2.args.length}`,
      },
    };
  }

  // Unify arguments
  let subst = conResult.subst;
  for (let i = 0; i < t1.args.length; i++) {
    const argResult = unify(
      applySubst(subst, t1.args[i]),
      applySubst(subst, t2.args[i])
    );
    if (!argResult.ok) return argResult;
    subst = composeSubst(argResult.subst, subst);
  }

  return { ok: true, subst };
}

/**
 * Unify two function types.
 */
function unifyFn(t1: TypeFn, t2: TypeFn): UnifyResult {
  // Check arity
  if (t1.params.length !== t2.params.length) {
    return {
      ok: false,
      error: {
        kind: "arity_mismatch",
        expected: t1,
        actual: t2,
        message: `Function arity mismatch: expected ${t1.params.length} parameters, got ${t2.params.length}`,
      },
    };
  }

  // Unify parameters (contravariant, but for unification we just need equality)
  let subst: Substitution = emptySubst();
  for (let i = 0; i < t1.params.length; i++) {
    const paramResult = unify(
      applySubst(subst, t1.params[i]),
      applySubst(subst, t2.params[i])
    );
    if (!paramResult.ok) return paramResult;
    subst = composeSubst(paramResult.subst, subst);
  }

  // Unify return types
  const retResult = unify(
    applySubst(subst, t1.returnType),
    applySubst(subst, t2.returnType)
  );
  if (!retResult.ok) return retResult;

  return { ok: true, subst: composeSubst(retResult.subst, subst) };
}

/**
 * Unify two tuple types.
 */
function unifyTuple(t1: TypeTuple, t2: TypeTuple): UnifyResult {
  if (t1.elements.length !== t2.elements.length) {
    return {
      ok: false,
      error: {
        kind: "arity_mismatch",
        expected: t1,
        actual: t2,
        message: `Tuple size mismatch: expected ${t1.elements.length} elements, got ${t2.elements.length}`,
      },
    };
  }

  let subst: Substitution = emptySubst();
  for (let i = 0; i < t1.elements.length; i++) {
    const elemResult = unify(
      applySubst(subst, t1.elements[i]),
      applySubst(subst, t2.elements[i])
    );
    if (!elemResult.ok) return elemResult;
    subst = composeSubst(elemResult.subst, subst);
  }

  return { ok: true, subst };
}

/**
 * Unify two record types.
 */
function unifyRecord(t1: TypeRecord, t2: TypeRecord): UnifyResult {
  let subst: Substitution = emptySubst();

  // Check that all fields in t1 exist in t2 with matching types
  for (const [name, type1] of t1.fields) {
    const type2 = t2.fields.get(name);
    if (!type2) {
      if (!t2.isOpen) {
        return {
          ok: false,
          error: {
            kind: "missing_field",
            expected: t1,
            actual: t2,
            message: `Missing field '${name}' in record`,
            details: name,
          },
        };
      }
      continue;
    }
    const fieldResult = unify(
      applySubst(subst, type1),
      applySubst(subst, type2)
    );
    if (!fieldResult.ok) return fieldResult;
    subst = composeSubst(fieldResult.subst, subst);
  }

  // Check that all fields in t2 exist in t1 (unless t1 is open)
  for (const [name] of t2.fields) {
    if (!t1.fields.has(name) && !t1.isOpen) {
      return {
        ok: false,
        error: {
          kind: "missing_field",
          expected: t1,
          actual: t2,
          message: `Unexpected field '${name}' in record`,
          details: name,
        },
      };
    }
  }

  return { ok: true, subst };
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Try to unify two types, returning true if successful.
 */
export function canUnify(t1: Type, t2: Type): boolean {
  return unify(t1, t2).ok;
}

/**
 * Unify a list of types pairwise, ensuring they're all equal.
 */
export function unifyAll(types: Type[]): UnifyResult {
  if (types.length < 2) {
    return { ok: true, subst: emptySubst() };
  }

  let subst: Substitution = emptySubst();
  const first = types[0];

  for (let i = 1; i < types.length; i++) {
    const result = unify(applySubst(subst, first), applySubst(subst, types[i]));
    if (!result.ok) return result;
    subst = composeSubst(result.subst, subst);
  }

  return { ok: true, subst };
}
