/**
 * Internal Type Representation
 *
 * This is separate from the AST TypeExpr (syntax) - these are semantic types
 * used during type checking and inference.
 */


// =============================================================================
// Type Variables (for inference)
// =============================================================================

let typeVarCounter = 0;

export function freshTypeVar(name?: string): TypeVar {
  return { kind: "var", id: typeVarCounter++, name };
}

export function resetTypeVarCounter(): void {
  typeVarCounter = 0;
}

// =============================================================================
// Type Definitions
// =============================================================================

export type Type =
  | TypeVar
  | TypeCon
  | TypeApp
  | TypeFn
  | TypeTuple
  | TypeArray
  | TypeRecord
  | TypeNever;

/**
 * Type variable - placeholder during inference
 */
export interface TypeVar {
  kind: "var";
  id: number;
  name?: string | undefined;
}

/**
 * Type constructor - named types like Int, Bool, Str, Option, etc.
 */
export interface TypeCon {
  kind: "con";
  name: string;
}

/**
 * Type application - generic types with arguments
 * e.g., Option[Int], Result[T, E], Map[K, V]
 */
export interface TypeApp {
  kind: "app";
  con: Type;
  args: Type[];
}

/**
 * Function type - (T1, T2) -> U
 */
export interface TypeFn {
  kind: "fn";
  params: Type[];
  returnType: Type;
}

/**
 * Tuple type - (T, U, V)
 */
export interface TypeTuple {
  kind: "tuple";
  elements: Type[];
}

/**
 * Array type - [T]
 */
export interface TypeArray {
  kind: "array";
  element: Type;
}

/**
 * Record type - { name: Str, age: Int }
 */
export interface TypeRecord {
  kind: "record";
  fields: Map<string, Type>;
  isOpen: boolean; // Has trailing ... for extensibility
}

/**
 * Never type - bottom type with no values
 */
export interface TypeNever {
  kind: "never";
}

// =============================================================================
// Built-in Type Constants
// =============================================================================

export const TYPE_INT: TypeCon = { kind: "con", name: "Int" };
export const TYPE_INT32: TypeCon = { kind: "con", name: "Int32" };
export const TYPE_INT64: TypeCon = { kind: "con", name: "Int64" };
export const TYPE_NAT: TypeCon = { kind: "con", name: "Nat" };
export const TYPE_FLOAT: TypeCon = { kind: "con", name: "Float" };
export const TYPE_BOOL: TypeCon = { kind: "con", name: "Bool" };
export const TYPE_STR: TypeCon = { kind: "con", name: "Str" };
export const TYPE_UNIT: TypeCon = { kind: "con", name: "Unit" };
export const TYPE_NEVER: TypeNever = { kind: "never" };

// =============================================================================
// Type Scheme (for polymorphic types)
// =============================================================================

/**
 * Type scheme - a polymorphic type with bound type variables
 * e.g., forall T. (T) -> T
 */
export interface TypeScheme {
  typeParams: string[];
  type: Type;
}

// =============================================================================
// Type Constructors (Helpers)
// =============================================================================

export function typeCon(name: string): TypeCon {
  return { kind: "con", name };
}

export function typeApp(con: Type, args: Type[]): TypeApp {
  return { kind: "app", con, args };
}

export function typeFn(params: Type[], returnType: Type): TypeFn {
  return { kind: "fn", params, returnType };
}

export function typeTuple(elements: Type[]): TypeTuple {
  return { kind: "tuple", elements };
}

export function typeArray(element: Type): TypeArray {
  return { kind: "array", element };
}

export function typeRecord(
  fields: Map<string, Type> | Record<string, Type>,
  isOpen = false
): TypeRecord {
  const fieldMap =
    fields instanceof Map ? fields : new Map(Object.entries(fields));
  return { kind: "record", fields: fieldMap, isOpen };
}

/**
 * Create Option[T] type
 */
export function typeOption(inner: Type): TypeApp {
  return { kind: "app", con: { kind: "con", name: "Option" }, args: [inner] };
}

/**
 * Create Result[T, E] type
 */
export function typeResult(ok: Type, err: Type): TypeApp {
  return { kind: "app", con: { kind: "con", name: "Result" }, args: [ok, err] };
}

// =============================================================================
// Type Formatting (for error messages)
// =============================================================================

/**
 * Format a type as a human-readable string.
 */
export function formatType(t: Type): string {
  switch (t.kind) {
    case "var":
      return t.name ?? `?${t.id}`;

    case "con":
      return t.name;

    case "app": {
      const con = formatType(t.con);
      const args = t.args.map(formatType).join(", ");
      return `${con}[${args}]`;
    }

    case "fn": {
      const params =
        t.params.length === 1
          ? formatType(t.params[0])
          : `(${t.params.map(formatType).join(", ")})`;
      return `${params} -> ${formatType(t.returnType)}`;
    }

    case "tuple":
      return `(${t.elements.map(formatType).join(", ")})`;

    case "array":
      return `[${formatType(t.element)}]`;

    case "record": {
      const fields = Array.from(t.fields.entries())
        .map(([k, v]) => `${k}: ${formatType(v)}`)
        .join(", ");
      return t.isOpen ? `{${fields}, ...}` : `{${fields}}`;
    }

    case "never":
      return "never";
  }
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Check if a type is a numeric type.
 */
export function isNumericType(t: Type): boolean {
  if (t.kind === "con") {
    return ["Int", "Int32", "Int64", "Nat", "Float"].includes(t.name);
  }
  return false;
}

/**
 * Check if a type is an integer type.
 */
export function isIntegerType(t: Type): boolean {
  if (t.kind === "con") {
    return ["Int", "Int32", "Int64", "Nat"].includes(t.name);
  }
  return false;
}

/**
 * Check if two types are structurally equal.
 */
export function typesEqual(a: Type, b: Type): boolean {
  if (a.kind !== b.kind) return false;

  switch (a.kind) {
    case "var":
      return a.id === (b as TypeVar).id;

    case "con":
      return a.name === (b as TypeCon).name;

    case "app": {
      const bApp = b as TypeApp;
      return (
        typesEqual(a.con, bApp.con) &&
        a.args.length === bApp.args.length &&
        a.args.every((arg, i) => typesEqual(arg, bApp.args[i]))
      );
    }

    case "fn": {
      const bFn = b as TypeFn;
      return (
        a.params.length === bFn.params.length &&
        a.params.every((p, i) => typesEqual(p, bFn.params[i])) &&
        typesEqual(a.returnType, bFn.returnType)
      );
    }

    case "tuple": {
      const bTuple = b as TypeTuple;
      return (
        a.elements.length === bTuple.elements.length &&
        a.elements.every((e, i) => typesEqual(e, bTuple.elements[i]))
      );
    }

    case "array":
      return typesEqual(a.element, (b as TypeArray).element);

    case "record": {
      const bRecord = b as TypeRecord;
      if (a.fields.size !== bRecord.fields.size) return false;
      if (a.isOpen !== bRecord.isOpen) return false;
      for (const [name, type] of a.fields) {
        const bType = bRecord.fields.get(name);
        if (!bType || !typesEqual(type, bType)) return false;
      }
      return true;
    }

    case "never":
      return true;
  }
}

/**
 * Get all free type variables in a type.
 */
export function freeTypeVars(t: Type): Set<number> {
  const result = new Set<number>();

  function collect(type: Type): void {
    switch (type.kind) {
      case "var":
        result.add(type.id);
        break;
      case "con":
      case "never":
        break;
      case "app":
        collect(type.con);
        type.args.forEach(collect);
        break;
      case "fn":
        type.params.forEach(collect);
        collect(type.returnType);
        break;
      case "tuple":
        type.elements.forEach(collect);
        break;
      case "array":
        collect(type.element);
        break;
      case "record":
        type.fields.forEach(collect);
        break;
    }
  }

  collect(t);
  return result;
}
