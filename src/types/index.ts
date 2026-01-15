/**
 * Axon Type System Module
 *
 * Provides type checking with bidirectional type inference and
 * Hindley-Milner style unification.
 */

// Type representation
export type {
  Type,
  TypeVar,
  TypeCon,
  TypeApp,
  TypeFn,
  TypeTuple,
  TypeArray,
  TypeRecord,
  TypeNever,
  TypeScheme,
} from "./types";

export {
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
  resetTypeVarCounter,
  typeCon,
  typeApp,
  typeFn,
  typeTuple,
  typeArray,
  typeRecord,
  typeOption,
  typeResult,
  formatType,
  isNumericType,
  isIntegerType,
  typesEqual,
  freeTypeVars,
} from "./types";

// Type context
export type { Binding, BindingSource, TypeDef, TypeDefKind, VariantDef } from "./context";
export { TypeContext, createGlobalContext } from "./context";

// Unification
export type { Substitution, UnifyError, UnifyResult } from "./unify";
export {
  emptySubst,
  singletonSubst,
  applySubst,
  composeSubst,
  unify,
  canUnify,
  unifyAll,
} from "./unify";

// Type expression conversion
export { convertTypeExpr, bindTypeParams, isUnitTypeExpr, isNeverTypeExpr } from "./convert";
export type { ConvertOptions } from "./convert";

// Built-ins
export { getBuiltinFunctions, initializeBuiltins } from "./builtins";
export type { BuiltinFn } from "./builtins";

// Type checker
export type { CheckResult } from "./checker";
export { TypeChecker, typecheck } from "./checker";
