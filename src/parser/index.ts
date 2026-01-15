/**
 * Axon Parser Module
 *
 * Exports the parser and AST types for parsing Axon source code.
 */

export { Parser, parse, type ParseError } from "./parser";
export type {
  // AST Node Base
  AstNode,

  // Literals
  LiteralValue,

  // Patterns
  Pattern,
  WildcardPattern,
  IdentPattern,
  LiteralPattern,
  TuplePattern,
  RecordPattern,
  VariantPattern,

  // Type Expressions
  TypeExpr,
  NamedTypeExpr,
  ArrayTypeExpr,
  TupleTypeExpr,
  FunctionTypeExpr,
  RefinedTypeExpr,
  EffectTypeExpr,
  RecordTypeExpr,

  // Expressions
  Expr,
  LiteralExpr,
  IdentExpr,
  UnaryExpr,
  BinaryExpr,
  CallExpr,
  IndexExpr,
  FieldExpr,
  LambdaExpr,
  IfExpr,
  MatchExpr,
  BlockExpr,
  ArrayExpr,
  TupleExpr,
  RecordExpr,
  RangeExpr,
  PropagateExpr,
  UnaryOp,
  BinaryOp,
  LambdaParam,
  MatchArm,

  // Statements
  Stmt,
  LetStmt,
  AssignStmt,
  ExprStmt,
  ForStmt,
  WhileStmt,
  LoopStmt,
  ReturnStmt,
  BreakStmt,
  ContinueStmt,
  AssertStmt,

  // Declarations
  Decl,
  ModDecl,
  UseDecl,
  TypeAliasDecl,
  RecDecl,
  SumDecl,
  FnDecl,
  ExternalFnDecl,
  ExternalModDecl,
  TypeParam,
  FnParam,
  RecField,
  SumVariant,
  SumVariantField,

  // Program
  Program,
} from "./ast";

// Re-export AST builder helpers
export { literal, ident, binary, unary, call, block } from "./ast";
