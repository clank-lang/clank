/**
 * Clank Code Generator Module
 *
 * Generates JavaScript or TypeScript code from Clank AST.
 */

export type { EmitOptions, EmitResult, TypeInfo, RecordTypeInfo, SumTypeInfo } from "./emitter";
export { CodeEmitter, emit, emitTS } from "./emitter";
export { getRuntimeCode, getMinimalRuntimeCode, getRuntimeCodeTS, getMinimalRuntimeCodeTS, getRuntimeTypes } from "./runtime";
export { typeToTS, generateTypeDeclaration } from "./types-ts";
export type { UnparseOptions, UnparseResult } from "./unparse";
export { unparse } from "./unparse";
