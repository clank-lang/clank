/**
 * Abstract Syntax Tree definitions for Axon
 *
 * All AST nodes include a SourceSpan for error reporting and a stable ID
 * for referencing in diagnostics and repairs.
 */

import type { SourceSpan } from "../utils/span";

// =============================================================================
// Node ID Generation
// =============================================================================

let nodeIdCounter = 0;

/**
 * Generate a unique node ID. IDs are stable within a compilation session.
 * Format: "n{counter}" (e.g., "n1", "n2", ...)
 */
export function generateNodeId(): string {
  return `n${++nodeIdCounter}`;
}

/**
 * Reset the node ID counter. Call at the start of each compilation session
 * to ensure deterministic IDs for the same input.
 */
export function resetNodeIdCounter(): void {
  nodeIdCounter = 0;
}

/**
 * Get current counter value (for testing/debugging).
 */
export function getNodeIdCounter(): number {
  return nodeIdCounter;
}

// =============================================================================
// Base Types
// =============================================================================

export interface AstNode {
  /** Unique identifier for this node, stable within a compilation session */
  id: string;
  /** Source location span for error reporting */
  span: SourceSpan;
}

// =============================================================================
// Literals
// =============================================================================

export type LiteralValue =
  | { kind: "int"; value: bigint; suffix: "i32" | "i64" | null }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string }
  | { kind: "template"; value: string } // Template strings need special handling later
  | { kind: "bool"; value: boolean }
  | { kind: "unit" };

// =============================================================================
// Patterns (for match, let destructuring)
// =============================================================================

export type Pattern =
  | WildcardPattern
  | IdentPattern
  | LiteralPattern
  | TuplePattern
  | RecordPattern
  | VariantPattern;

export interface WildcardPattern extends AstNode {
  kind: "wildcard";
}

export interface IdentPattern extends AstNode {
  kind: "ident";
  name: string;
}

export interface LiteralPattern extends AstNode {
  kind: "literal";
  value: LiteralValue;
}

export interface TuplePattern extends AstNode {
  kind: "tuple";
  elements: Pattern[];
}

export interface RecordPattern extends AstNode {
  kind: "record";
  fields: { name: string; pattern?: Pattern | undefined }[];
}

export interface VariantPattern extends AstNode {
  kind: "variant";
  name: string;
  payload?: Pattern[] | undefined;
}

// =============================================================================
// Type Expressions
// =============================================================================

export type TypeExpr =
  | NamedTypeExpr
  | ArrayTypeExpr
  | TupleTypeExpr
  | FunctionTypeExpr
  | RefinedTypeExpr
  | EffectTypeExpr
  | RecordTypeExpr;

export interface NamedTypeExpr extends AstNode {
  kind: "named";
  name: string;
  args: TypeExpr[];
}

export interface ArrayTypeExpr extends AstNode {
  kind: "array";
  element: TypeExpr;
}

export interface TupleTypeExpr extends AstNode {
  kind: "tuple";
  elements: TypeExpr[];
}

export interface FunctionTypeExpr extends AstNode {
  kind: "function";
  params: TypeExpr[];
  returnType: TypeExpr;
}

export interface RefinedTypeExpr extends AstNode {
  kind: "refined";
  base: TypeExpr;
  varName?: string | undefined; // Optional explicit variable name
  predicate: Expr;
}

export interface EffectTypeExpr extends AstNode {
  kind: "effect";
  effects: TypeExpr[]; // e.g., [IO, Err[E]]
  resultType: TypeExpr;
}

export interface RecordTypeExpr extends AstNode {
  kind: "recordType";
  fields: { name: string; type: TypeExpr }[];
  isOpen: boolean; // Has trailing ...
}

// =============================================================================
// Expressions
// =============================================================================

export type Expr =
  | LiteralExpr
  | IdentExpr
  | UnaryExpr
  | BinaryExpr
  | CallExpr
  | IndexExpr
  | FieldExpr
  | LambdaExpr
  | IfExpr
  | MatchExpr
  | BlockExpr
  | ArrayExpr
  | TupleExpr
  | RecordExpr
  | RangeExpr
  | PropagateExpr; // The ? operator

export interface LiteralExpr extends AstNode {
  kind: "literal";
  value: LiteralValue;
}

export interface IdentExpr extends AstNode {
  kind: "ident";
  name: string;
}

export interface UnaryExpr extends AstNode {
  kind: "unary";
  op: UnaryOp;
  operand: Expr;
}

export type UnaryOp = "-" | "!" | "¬";

export interface BinaryExpr extends AstNode {
  kind: "binary";
  op: BinaryOp;
  left: Expr;
  right: Expr;
}

export type BinaryOp =
  // Arithmetic
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "^"
  // Comparison
  | "=="
  | "!="
  | "≠"
  | "<"
  | ">"
  | "<="
  | "≤"
  | ">="
  | "≥"
  // Logical
  | "&&"
  | "∧"
  | "||"
  | "∨"
  // String
  | "++"
  // Pipe
  | "|>";

export interface CallExpr extends AstNode {
  kind: "call";
  callee: Expr;
  args: Expr[];
}

export interface IndexExpr extends AstNode {
  kind: "index";
  object: Expr;
  index: Expr;
}

export interface FieldExpr extends AstNode {
  kind: "field";
  object: Expr;
  field: string;
}

export interface LambdaExpr extends AstNode {
  kind: "lambda";
  params: LambdaParam[];
  body: Expr;
}

export interface LambdaParam {
  name: string;
  type?: TypeExpr | undefined;
}

export interface IfExpr extends AstNode {
  kind: "if";
  condition: Expr;
  thenBranch: BlockExpr;
  elseBranch?: BlockExpr | IfExpr | undefined;
}

export interface MatchExpr extends AstNode {
  kind: "match";
  scrutinee: Expr;
  arms: MatchArm[];
}

export interface MatchArm {
  pattern: Pattern;
  guard?: Expr | undefined;
  body: Expr;
  span: SourceSpan;
}

export interface BlockExpr extends AstNode {
  kind: "block";
  statements: Stmt[];
  expr?: Expr | undefined; // Optional trailing expression (the block's value)
}

export interface ArrayExpr extends AstNode {
  kind: "array";
  elements: Expr[];
}

export interface TupleExpr extends AstNode {
  kind: "tuple";
  elements: Expr[];
}

export interface RecordExpr extends AstNode {
  kind: "record";
  fields: { name: string; value: Expr }[];
}

export interface RangeExpr extends AstNode {
  kind: "range";
  start: Expr;
  end: Expr;
  inclusive: boolean; // .. vs ..=
}

export interface PropagateExpr extends AstNode {
  kind: "propagate";
  expr: Expr;
}

// =============================================================================
// Statements
// =============================================================================

export type Stmt =
  | LetStmt
  | AssignStmt
  | ExprStmt
  | ForStmt
  | WhileStmt
  | LoopStmt
  | ReturnStmt
  | BreakStmt
  | ContinueStmt
  | AssertStmt;

export interface LetStmt extends AstNode {
  kind: "let";
  pattern: Pattern;
  mutable: boolean;
  type?: TypeExpr | undefined;
  init: Expr;
}

export interface AssignStmt extends AstNode {
  kind: "assign";
  target: Expr;
  value: Expr;
}

export interface ExprStmt extends AstNode {
  kind: "expr";
  expr: Expr;
}

export interface ForStmt extends AstNode {
  kind: "for";
  pattern: Pattern;
  iterable: Expr;
  body: BlockExpr;
}

export interface WhileStmt extends AstNode {
  kind: "while";
  condition: Expr;
  body: BlockExpr;
}

export interface LoopStmt extends AstNode {
  kind: "loop";
  body: BlockExpr;
}

export interface ReturnStmt extends AstNode {
  kind: "return";
  value?: Expr | undefined;
}

export interface BreakStmt extends AstNode {
  kind: "break";
}

export interface ContinueStmt extends AstNode {
  kind: "continue";
}

export interface AssertStmt extends AstNode {
  kind: "assert";
  condition: Expr;
  message?: string | undefined;
}

// =============================================================================
// Declarations
// =============================================================================

export type Decl =
  | ModDecl
  | UseDecl
  | TypeAliasDecl
  | RecDecl
  | SumDecl
  | FnDecl
  | ExternalFnDecl
  | ExternalModDecl;

export interface ModDecl extends AstNode {
  kind: "mod";
  name: string;
}

export interface UseDecl extends AstNode {
  kind: "use";
  path: string[];
  items?: string[] | undefined; // If using specific items: use std.io.{print, read}
  alias?: string | undefined; // use foo as bar
  isExternal: boolean; // use external lodash
}

export interface TypeAliasDecl extends AstNode {
  kind: "typeAlias";
  name: string;
  typeParams: TypeParam[];
  type: TypeExpr;
}

export interface TypeParam {
  name: string;
  constraint?: TypeExpr | undefined; // T: Ord
}

export interface RecDecl extends AstNode {
  kind: "rec";
  name: string;
  typeParams: TypeParam[];
  fields: RecField[];
}

export interface RecField {
  name: string;
  type: TypeExpr;
  span: SourceSpan;
}

export interface SumDecl extends AstNode {
  kind: "sum";
  name: string;
  typeParams: TypeParam[];
  variants: SumVariant[];
}

export interface SumVariant {
  name: string;
  fields?: SumVariantField[] | undefined;
  span: SourceSpan;
}

export interface SumVariantField {
  name?: string | undefined; // Named fields: Circle(center: Point, radius: ℝ)
  type: TypeExpr;
}

export interface FnDecl extends AstNode {
  kind: "fn";
  name: string;
  typeParams: TypeParam[];
  params: FnParam[];
  returnType: TypeExpr;
  precondition?: Expr | undefined;
  postcondition?: Expr | undefined;
  body: BlockExpr;
}

export interface FnParam {
  name: string;
  type: TypeExpr;
  span: SourceSpan;
}

export interface ExternalFnDecl extends AstNode {
  kind: "externalFn";
  name: string;
  typeParams: TypeParam[];
  params: FnParam[];
  returnType: TypeExpr;
  jsName: string; // The JavaScript name: = "console.log"
}

export interface ExternalModDecl extends AstNode {
  kind: "externalMod";
  name: string;
  jsModule: string; // The npm module: = "lodash"
  functions: ExternalFnDecl[];
}

// =============================================================================
// Program (root node)
// =============================================================================

export interface Program extends AstNode {
  kind: "program";
  declarations: Decl[];
}

// =============================================================================
// AST Builder Helpers
// =============================================================================

export function literal(span: SourceSpan, value: LiteralValue): LiteralExpr {
  return { kind: "literal", id: generateNodeId(), span, value };
}

export function ident(span: SourceSpan, name: string): IdentExpr {
  return { kind: "ident", id: generateNodeId(), span, name };
}

export function binary(span: SourceSpan, op: BinaryOp, left: Expr, right: Expr): BinaryExpr {
  return { kind: "binary", id: generateNodeId(), span, op, left, right };
}

export function unary(span: SourceSpan, op: UnaryOp, operand: Expr): UnaryExpr {
  return { kind: "unary", id: generateNodeId(), span, op, operand };
}

export function call(span: SourceSpan, callee: Expr, args: Expr[]): CallExpr {
  return { kind: "call", id: generateNodeId(), span, callee, args };
}

export function block(span: SourceSpan, statements: Stmt[], expr?: Expr): BlockExpr {
  return { kind: "block", id: generateNodeId(), span, statements, expr };
}
