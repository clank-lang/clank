/**
 * Error Code Registry
 *
 * Error codes follow the pattern:
 * - E0xxx: Syntax errors
 * - E1xxx: Name resolution errors
 * - E2xxx: Type errors
 * - E3xxx: Refinement errors
 * - E4xxx: Effect errors
 * - E5xxx: Linearity errors
 * - W0xxx: Warnings
 */

export const ErrorCode = {
  // ==========================================================================
  // E0xxx - Syntax errors (handled by lexer/parser)
  // ==========================================================================
  UnexpectedToken: "E0001",
  UnterminatedString: "E0002",
  InvalidNumeric: "E0003",
  MismatchedBrackets: "E0004",
  ExpectedExpression: "E0005",
  ExpectedType: "E0006",
  ExpectedPattern: "E0007",
  ExpectedDeclaration: "E0008",
  RecordLiteralSyntax: "E0009",

  // ==========================================================================
  // E1xxx - Name resolution errors
  // ==========================================================================
  UnresolvedName: "E1001",
  DuplicateDefinition: "E1002",
  ImportNotFound: "E1003",
  ModuleNotFound: "E1004",
  UnresolvedType: "E1005",
  VariantNotFound: "E1006",

  // ==========================================================================
  // E2xxx - Type errors
  // ==========================================================================
  TypeMismatch: "E2001",
  ArityMismatch: "E2002",
  MissingField: "E2003",
  UnknownField: "E2004",
  NotCallable: "E2005",
  NotIndexable: "E2006",
  MissingTypeAnnotation: "E2007",
  RecursiveType: "E2008",
  PatternMismatch: "E2009",
  NotIterable: "E2010",
  NotARecord: "E2011",
  InvalidPropagate: "E2012",
  ImmutableAssign: "E2013",
  ReturnOutsideFunction: "E2014",
  NonExhaustiveMatch: "E2015",
  InvalidOperandType: "E2016",
  TypeParamMismatch: "E2017",
  InfiniteType: "E2018",

  // ==========================================================================
  // E3xxx - Refinement errors (future)
  // ==========================================================================
  UnprovableRefinement: "E3001",
  PreconditionNotSatisfied: "E3002",
  PostconditionNotSatisfied: "E3003",
  AssertionUnprovable: "E3004",

  // ==========================================================================
  // E4xxx - Effect errors (future)
  // ==========================================================================
  EffectNotAllowed: "E4001",
  UnhandledEffect: "E4002",
  EffectMismatch: "E4003",

  // ==========================================================================
  // E5xxx - Linearity errors (future)
  // ==========================================================================
  LinearNotConsumed: "E5001",
  LinearUsedTwice: "E5002",
  LinearEscapes: "E5003",

  // ==========================================================================
  // W0xxx - Warnings
  // ==========================================================================
  UnusedVariable: "W0001",
  UnusedImport: "W0002",
  UnreachableCode: "W0003",
  ShadowedVariable: "W0004",
  DeprecatedFeature: "W0005",
  DuplicateVariantName: "W0006",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Get a human-readable description for an error code.
 */
export function getErrorDescription(code: string): string {
  const descriptions: Record<string, string> = {
    // Syntax
    E0001: "Unexpected token in input",
    E0002: "String literal is not properly terminated",
    E0003: "Invalid numeric literal",
    E0004: "Mismatched brackets or parentheses",
    E0005: "Expected an expression",
    E0006: "Expected a type",
    E0007: "Expected a pattern",
    E0008: "Expected a declaration",
    E0009: "Record literal syntax is not supported; use positional constructor",

    // Names
    E1001: "Name is not defined in this scope",
    E1002: "Name is already defined in this scope",
    E1003: "Imported item not found in module",
    E1004: "Module not found",
    E1005: "Type is not defined",
    E1006: "Variant not found in sum type",

    // Types
    E2001: "Types do not match",
    E2002: "Wrong number of arguments",
    E2003: "Required field is missing",
    E2004: "Field does not exist on this type",
    E2005: "Expression is not callable",
    E2006: "Expression is not indexable",
    E2007: "Type annotation required but missing",
    E2008: "Recursive type definition without indirection",
    E2009: "Pattern does not match expected type",
    E2010: "Expression is not iterable",
    E2011: "Expression is not a record",
    E2012: "Cannot use ? operator on this type",
    E2013: "Cannot assign to immutable variable",
    E2014: "Return statement outside of function",
    E2015: "Match expression is not exhaustive",
    E2016: "Invalid operand type for operator",
    E2017: "Wrong number of type parameters",
    E2018: "Infinite type detected (occurs check failed)",

    // Refinements
    E3001: "Cannot prove refinement predicate",
    E3002: "Precondition may not be satisfied",
    E3003: "Postcondition may not be satisfied",
    E3004: "Assertion cannot be proven",

    // Effects
    E4001: "Effect not allowed in this context",
    E4002: "Effect is not handled",
    E4003: "Effect signature mismatch",

    // Linearity
    E5001: "Linear resource not consumed",
    E5002: "Linear resource used more than once",
    E5003: "Linear resource escapes its scope",

    // Warnings
    W0001: "Variable is declared but never used",
    W0002: "Import is never used",
    W0003: "Code is unreachable",
    W0004: "Variable shadows an outer binding",
    W0005: "Feature is deprecated",
    W0006: "Variant name is already used by another sum type",
  };

  return descriptions[code] ?? "Unknown error";
}

/**
 * Get the severity for an error code.
 */
export function getCodeSeverity(
  code: string
): "error" | "warning" | "info" | "hint" {
  if (code.startsWith("W")) {
    return "warning";
  }
  return "error";
}
