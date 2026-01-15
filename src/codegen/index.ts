/**
 * Axon Code Generator Module
 *
 * Generates JavaScript code from Axon AST.
 */

export type { EmitOptions, EmitResult } from "./emitter";
export { CodeEmitter, emit } from "./emitter";
export { getRuntimeCode, getMinimalRuntimeCode } from "./runtime";
