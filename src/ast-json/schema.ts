/**
 * AST-as-JSON Schema
 *
 * This module defines the JSON schema for Clank AST nodes.
 * The format is designed for agent consumption - easy to generate and manipulate.
 *
 * Design principles:
 * 1. Mirror internal AST structure closely (same `kind` discriminators)
 * 2. Spans are optional on input (compiler synthesizes them)
 * 3. BigInt values are strings (JSON limitation)
 * 4. Support hybrid input: mix source strings with AST nodes
 * 5. All node types are self-describing via `kind` field
 */

// =============================================================================
// Span (optional on input)
// =============================================================================

export interface JsonSpan {
  file?: string;
  start?: { line: number; column: number; offset?: number };
  end?: { line: number; column: number; offset?: number };
}

// =============================================================================
// Hybrid Input Support
// =============================================================================

/**
 * Any AST node can be replaced with a source string that will be parsed.
 * This allows mixing generated AST with source snippets.
 */
export interface SourceFragment {
  source: string;
  file?: string; // Virtual filename for error messages
}

// =============================================================================
// Program
// =============================================================================

export interface JsonProgram {
  kind: "program";
  declarations: (JsonDecl | SourceFragment)[];
  span?: JsonSpan;
}

// =============================================================================
// Declarations
// =============================================================================

export type JsonDecl =
  | JsonFnDecl
  | JsonExternalFnDecl
  | JsonTypeAliasDecl
  | JsonRecDecl
  | JsonSumDecl
  | JsonModDecl
  | JsonUseDecl
  | SourceFragment;

export interface JsonFnDecl {
  kind: "fn";
  name: string;
  typeParams?: JsonTypeParam[];
  params: JsonParam[];
  returnType: JsonTypeExpr;
  precondition?: JsonExpr | SourceFragment;
  postcondition?: JsonExpr | SourceFragment;
  body: JsonBlockExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonExternalFnDecl {
  kind: "externalFn";
  name: string;
  typeParams?: JsonTypeParam[];
  params: JsonParam[];
  returnType: JsonTypeExpr;
  jsName: string;
  span?: JsonSpan;
}

export interface JsonTypeAliasDecl {
  kind: "typeAlias";
  name: string;
  typeParams?: JsonTypeParam[];
  type: JsonTypeExpr;
  span?: JsonSpan;
}

export interface JsonRecDecl {
  kind: "rec";
  name: string;
  typeParams?: JsonTypeParam[];
  fields: JsonFieldDef[];
  span?: JsonSpan;
}

export interface JsonSumDecl {
  kind: "sum";
  name: string;
  typeParams?: JsonTypeParam[];
  variants: JsonVariantDef[];
  span?: JsonSpan;
}

export interface JsonModDecl {
  kind: "mod";
  name: string;
  span?: JsonSpan;
}

export interface JsonUseDecl {
  kind: "use";
  path: string[];
  items?: string[];
  alias?: string;
  isExternal?: boolean;
  span?: JsonSpan;
}

// =============================================================================
// Type Parameters and Fields
// =============================================================================

export interface JsonTypeParam {
  name: string;
  constraint?: JsonTypeExpr;
}

export interface JsonParam {
  name: string;
  type: JsonTypeExpr;
  span?: JsonSpan;
}

export interface JsonLambdaParam {
  name: string;
  type?: JsonTypeExpr;
}

export interface JsonFieldDef {
  name: string;
  type: JsonTypeExpr;
  span?: JsonSpan;
}

export interface JsonVariantDef {
  name: string;
  fields?: JsonVariantFieldDef[];
  span?: JsonSpan;
}

export interface JsonVariantFieldDef {
  name?: string;
  type: JsonTypeExpr;
}

// =============================================================================
// Type Expressions
// =============================================================================

export type JsonTypeExpr =
  | JsonNamedType
  | JsonArrayType
  | JsonTupleType
  | JsonFunctionType
  | JsonRefinedType
  | JsonEffectType
  | JsonRecordType
  | SourceFragment;

export interface JsonNamedType {
  kind: "named";
  name: string;
  args?: JsonTypeExpr[];
  span?: JsonSpan;
}

export interface JsonArrayType {
  kind: "array";
  element: JsonTypeExpr;
  span?: JsonSpan;
}

export interface JsonTupleType {
  kind: "tuple";
  elements: JsonTypeExpr[];
  span?: JsonSpan;
}

export interface JsonFunctionType {
  kind: "function";
  params: JsonTypeExpr[];
  returnType: JsonTypeExpr;
  span?: JsonSpan;
}

export interface JsonRefinedType {
  kind: "refined";
  base: JsonTypeExpr;
  varName?: string;
  predicate: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonEffectType {
  kind: "effect";
  effects: JsonTypeExpr[];
  resultType: JsonTypeExpr;
  span?: JsonSpan;
}

export interface JsonRecordType {
  kind: "recordType";
  fields: { name: string; type: JsonTypeExpr }[];
  isOpen?: boolean;
  span?: JsonSpan;
}

// =============================================================================
// Expressions
// =============================================================================

export type JsonExpr =
  | JsonLiteralExpr
  | JsonIdentExpr
  | JsonUnaryExpr
  | JsonBinaryExpr
  | JsonCallExpr
  | JsonIndexExpr
  | JsonFieldExpr
  | JsonLambdaExpr
  | JsonIfExpr
  | JsonMatchExpr
  | JsonBlockExpr
  | JsonArrayExpr
  | JsonTupleExpr
  | JsonRecordExpr
  | JsonRangeExpr
  | JsonPropagateExpr
  | SourceFragment;

export interface JsonLiteralExpr {
  kind: "literal";
  value:
    | { kind: "int"; value: string; suffix?: "i32" | "i64" | null } // String for BigInt
    | { kind: "float"; value: number }
    | { kind: "string"; value: string }
    | { kind: "template"; value: string }
    | { kind: "bool"; value: boolean }
    | { kind: "unit" };
  span?: JsonSpan;
}

export interface JsonIdentExpr {
  kind: "ident";
  name: string;
  span?: JsonSpan;
}

export interface JsonUnaryExpr {
  kind: "unary";
  op: string; // "!", "-", "¬"
  operand: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonBinaryExpr {
  kind: "binary";
  op: string;
  left: JsonExpr | SourceFragment;
  right: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonCallExpr {
  kind: "call";
  callee: JsonExpr | SourceFragment;
  args: (JsonExpr | SourceFragment)[];
  span?: JsonSpan;
}

export interface JsonIndexExpr {
  kind: "index";
  object: JsonExpr | SourceFragment;
  index: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonFieldExpr {
  kind: "field";
  object: JsonExpr | SourceFragment;
  field: string;
  span?: JsonSpan;
}

export interface JsonLambdaExpr {
  kind: "lambda";
  params: JsonLambdaParam[];
  body: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonIfExpr {
  kind: "if";
  condition: JsonExpr | SourceFragment;
  thenBranch: JsonBlockExpr | SourceFragment;
  elseBranch?: JsonBlockExpr | JsonIfExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonMatchExpr {
  kind: "match";
  scrutinee: JsonExpr | SourceFragment;
  arms: JsonMatchArm[];
  span?: JsonSpan;
}

export interface JsonMatchArm {
  pattern: JsonPattern | SourceFragment;
  guard?: JsonExpr | SourceFragment;
  body: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonBlockExpr {
  kind: "block";
  statements: (JsonStmt | SourceFragment)[];
  expr?: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonArrayExpr {
  kind: "array";
  elements: (JsonExpr | SourceFragment)[];
  span?: JsonSpan;
}

export interface JsonTupleExpr {
  kind: "tuple";
  elements: (JsonExpr | SourceFragment)[];
  span?: JsonSpan;
}

export interface JsonRecordExpr {
  kind: "record";
  fields: { name: string; value: JsonExpr | SourceFragment }[];
  span?: JsonSpan;
}

export interface JsonRangeExpr {
  kind: "range";
  start: JsonExpr | SourceFragment;
  end: JsonExpr | SourceFragment;
  inclusive?: boolean;
  span?: JsonSpan;
}

export interface JsonPropagateExpr {
  kind: "propagate";
  expr: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

// =============================================================================
// Statements
// =============================================================================

export type JsonStmt =
  | JsonExprStmt
  | JsonLetStmt
  | JsonAssignStmt
  | JsonForStmt
  | JsonWhileStmt
  | JsonLoopStmt
  | JsonReturnStmt
  | JsonBreakStmt
  | JsonContinueStmt
  | JsonAssertStmt
  | SourceFragment;

export interface JsonExprStmt {
  kind: "expr";
  expr: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonLetStmt {
  kind: "let";
  pattern: JsonPattern | SourceFragment;
  type?: JsonTypeExpr;
  mutable?: boolean;
  init: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonAssignStmt {
  kind: "assign";
  target: JsonExpr | SourceFragment;
  value: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonForStmt {
  kind: "for";
  pattern: JsonPattern | SourceFragment;
  iterable: JsonExpr | SourceFragment;
  body: JsonBlockExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonWhileStmt {
  kind: "while";
  condition: JsonExpr | SourceFragment;
  body: JsonBlockExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonLoopStmt {
  kind: "loop";
  body: JsonBlockExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonReturnStmt {
  kind: "return";
  value?: JsonExpr | SourceFragment;
  span?: JsonSpan;
}

export interface JsonBreakStmt {
  kind: "break";
  span?: JsonSpan;
}

export interface JsonContinueStmt {
  kind: "continue";
  span?: JsonSpan;
}

export interface JsonAssertStmt {
  kind: "assert";
  condition: JsonExpr | SourceFragment;
  message?: string;
  span?: JsonSpan;
}

// =============================================================================
// Patterns
// =============================================================================

export type JsonPattern =
  | JsonWildcardPattern
  | JsonIdentPattern
  | JsonLiteralPattern
  | JsonTuplePattern
  | JsonRecordPattern
  | JsonVariantPattern
  | SourceFragment;

export interface JsonWildcardPattern {
  kind: "wildcard";
  span?: JsonSpan;
}

export interface JsonIdentPattern {
  kind: "ident";
  name: string;
  span?: JsonSpan;
}

export interface JsonLiteralPattern {
  kind: "literal";
  value:
    | { kind: "int"; value: string; suffix?: "i32" | "i64" | null }
    | { kind: "float"; value: number }
    | { kind: "string"; value: string }
    | { kind: "bool"; value: boolean };
  span?: JsonSpan;
}

export interface JsonTuplePattern {
  kind: "tuple";
  elements: (JsonPattern | SourceFragment)[];
  span?: JsonSpan;
}

export interface JsonRecordPattern {
  kind: "record";
  fields: { name: string; pattern?: JsonPattern | SourceFragment }[];
  span?: JsonSpan;
}

export interface JsonVariantPattern {
  kind: "variant";
  name: string;
  payload?: (JsonPattern | SourceFragment)[];
  span?: JsonSpan;
}

// =============================================================================
// Type Guards
// =============================================================================

export function isSourceFragment(node: unknown): node is SourceFragment {
  return typeof node === "object" && node !== null && "source" in node;
}
