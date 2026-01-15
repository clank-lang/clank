/**
 * Type Context
 *
 * Manages type environment including variable bindings, type definitions,
 * and scope handling for the type checker.
 */

import type { SourceSpan } from "../utils/span";
import type { Type, TypeScheme } from "./types";

// =============================================================================
// Binding Information
// =============================================================================

export type BindingSource =
  | "parameter"
  | "let"
  | "for"
  | "match"
  | "function"
  | "external";

export interface Binding {
  type: Type | TypeScheme;
  mutable: boolean;
  span: SourceSpan;
  source: BindingSource;
}

// =============================================================================
// Type Definitions
// =============================================================================

export type TypeDefKind = "alias" | "record" | "sum";

export interface TypeDef {
  kind: TypeDefKind;
  name: string;
  typeParams: string[];
  /** The underlying type (for aliases) or the constructed type (for rec/sum) */
  type: Type;
  /** For sum types: variant name -> field types */
  variants?: Map<string, VariantDef> | undefined;
  /** For record types: field name -> type */
  fields?: Map<string, Type> | undefined;
  span: SourceSpan;
}

export interface VariantDef {
  fields: Type[];
  fieldNames?: string[] | undefined; // Named fields for records-in-variants
}

// =============================================================================
// Type Context
// =============================================================================

export class TypeContext {
  private bindings: Map<string, Binding> = new Map();
  private types: Map<string, TypeDef> = new Map();
  private typeParams: Map<string, Type> = new Map();
  private parent: TypeContext | null = null;

  constructor(parent?: TypeContext) {
    this.parent = parent ?? null;
  }

  // ===========================================================================
  // Scope Management
  // ===========================================================================

  /**
   * Create a child scope.
   */
  child(): TypeContext {
    return new TypeContext(this);
  }

  /**
   * Get the parent scope, if any.
   */
  getParent(): TypeContext | null {
    return this.parent;
  }

  /**
   * Get the root (global) scope.
   */
  getRoot(): TypeContext {
    let ctx: TypeContext = this;
    while (ctx.parent !== null) {
      ctx = ctx.parent;
    }
    return ctx;
  }

  // ===========================================================================
  // Variable Bindings
  // ===========================================================================

  /**
   * Define a variable in the current scope.
   */
  define(name: string, binding: Binding): void {
    this.bindings.set(name, binding);
  }

  /**
   * Look up a variable, searching parent scopes.
   */
  lookup(name: string): Binding | undefined {
    const local = this.bindings.get(name);
    if (local !== undefined) return local;
    return this.parent?.lookup(name);
  }

  /**
   * Check if a variable is defined in the current scope (not parent).
   */
  isDefinedLocally(name: string): boolean {
    return this.bindings.has(name);
  }

  /**
   * Check if a variable is defined anywhere in the scope chain.
   */
  isDefined(name: string): boolean {
    return this.lookup(name) !== undefined;
  }

  /**
   * Get all bindings visible in the current scope.
   */
  getAllBindings(): Map<string, Binding> {
    const result = new Map<string, Binding>();

    // Start with parent bindings (will be overwritten by child)
    if (this.parent) {
      for (const [k, v] of this.parent.getAllBindings()) {
        result.set(k, v);
      }
    }

    // Add local bindings
    for (const [k, v] of this.bindings) {
      result.set(k, v);
    }

    return result;
  }

  // ===========================================================================
  // Type Definitions
  // ===========================================================================

  /**
   * Define a type in the current scope.
   */
  defineType(name: string, def: TypeDef): void {
    this.types.set(name, def);
  }

  /**
   * Look up a type definition, searching parent scopes.
   */
  lookupType(name: string): TypeDef | undefined {
    const local = this.types.get(name);
    if (local !== undefined) return local;
    return this.parent?.lookupType(name);
  }

  /**
   * Check if a type is defined.
   */
  isTypeDefined(name: string): boolean {
    return this.lookupType(name) !== undefined;
  }

  /**
   * Get all type definitions visible in the current scope.
   */
  getAllTypes(): Map<string, TypeDef> {
    const result = new Map<string, TypeDef>();

    if (this.parent) {
      for (const [k, v] of this.parent.getAllTypes()) {
        result.set(k, v);
      }
    }

    for (const [k, v] of this.types) {
      result.set(k, v);
    }

    return result;
  }

  // ===========================================================================
  // Type Parameters (for generic functions)
  // ===========================================================================

  /**
   * Bind a type parameter to a type.
   */
  bindTypeParam(name: string, type: Type): void {
    this.typeParams.set(name, type);
  }

  /**
   * Look up a type parameter binding.
   */
  lookupTypeParam(name: string): Type | undefined {
    const local = this.typeParams.get(name);
    if (local !== undefined) return local;
    return this.parent?.lookupTypeParam(name);
  }

  /**
   * Get all type parameter bindings.
   */
  getAllTypeParams(): Map<string, Type> {
    const result = new Map<string, Type>();

    if (this.parent) {
      for (const [k, v] of this.parent.getAllTypeParams()) {
        result.set(k, v);
      }
    }

    for (const [k, v] of this.typeParams) {
      result.set(k, v);
    }

    return result;
  }

  // ===========================================================================
  // Debugging
  // ===========================================================================

  /**
   * Get a string representation of the context for debugging.
   */
  toString(): string {
    const lines: string[] = [];

    lines.push("Bindings:");
    for (const [name, binding] of this.bindings) {
      const typeStr =
        "typeParams" in binding.type
          ? `<scheme>`
          : `${(binding.type as Type).kind}`;
      lines.push(`  ${name}: ${typeStr} (${binding.source})`);
    }

    lines.push("Types:");
    for (const [name, def] of this.types) {
      lines.push(`  ${name}: ${def.kind}`);
    }

    if (this.parent) {
      lines.push("Parent:");
      lines.push(
        this.parent
          .toString()
          .split("\n")
          .map((l) => "  " + l)
          .join("\n")
      );
    }

    return lines.join("\n");
  }
}

// =============================================================================
// Context Factory
// =============================================================================

/**
 * Create a fresh type context with built-in types pre-defined.
 */
export function createGlobalContext(): TypeContext {
  const ctx = new TypeContext();

  // Built-in types are recognized by name in the type checker,
  // not stored in the context. This keeps things simple.

  return ctx;
}
