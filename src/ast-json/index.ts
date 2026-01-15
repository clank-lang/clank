/**
 * AST-as-JSON Module
 *
 * Provides bidirectional conversion between Clank AST and JSON format.
 * Designed for agent consumption - easy to generate and manipulate.
 *
 * Key features:
 * - Serialize AST to JSON for LLM analysis
 * - Deserialize JSON to AST for programmatic code generation
 * - Hybrid input: mix AST nodes with source code strings
 * - Full compiler feedback on JSON-generated AST
 */

// Schema types
export type {
  JsonProgram,
  JsonDecl,
  JsonFnDecl,
  JsonExternalFnDecl,
  JsonTypeAliasDecl,
  JsonRecDecl,
  JsonSumDecl,
  JsonModDecl,
  JsonUseDecl,
  JsonTypeParam,
  JsonParam,
  JsonLambdaParam,
  JsonFieldDef,
  JsonVariantDef,
  JsonVariantFieldDef,
  JsonTypeExpr,
  JsonNamedType,
  JsonArrayType,
  JsonTupleType,
  JsonFunctionType,
  JsonRefinedType,
  JsonEffectType,
  JsonRecordType,
  JsonExpr,
  JsonLiteralExpr,
  JsonIdentExpr,
  JsonUnaryExpr,
  JsonBinaryExpr,
  JsonCallExpr,
  JsonIndexExpr,
  JsonFieldExpr,
  JsonLambdaExpr,
  JsonIfExpr,
  JsonMatchExpr,
  JsonBlockExpr,
  JsonArrayExpr,
  JsonTupleExpr,
  JsonRecordExpr,
  JsonRangeExpr,
  JsonPropagateExpr,
  JsonMatchArm,
  JsonStmt,
  JsonExprStmt,
  JsonLetStmt,
  JsonAssignStmt,
  JsonForStmt,
  JsonWhileStmt,
  JsonLoopStmt,
  JsonReturnStmt,
  JsonBreakStmt,
  JsonContinueStmt,
  JsonAssertStmt,
  JsonPattern,
  JsonWildcardPattern,
  JsonIdentPattern,
  JsonLiteralPattern,
  JsonTuplePattern,
  JsonRecordPattern,
  JsonVariantPattern,
  JsonSpan,
  SourceFragment,
} from "./schema";

export { isSourceFragment } from "./schema";

// Serialization (AST → JSON)
export {
  serializeProgram,
  programToJson,
  type SerializeOptions,
} from "./serialize";

// Deserialization (JSON → AST)
export {
  deserializeProgram,
  type DeserializeError,
  type DeserializeResult,
} from "./deserialize";
