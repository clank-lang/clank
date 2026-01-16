/**
 * Canonical AST Module
 *
 * Transforms the parsed AST into a canonical form that:
 * 1. Desugars syntactic sugar (Unicode operators, pipe, etc.)
 * 2. Normalizes structure (explicit else branches, explicit returns)
 * 3. Annotates expressions with inferred types and effects
 * 4. Inserts runtime validators at type boundaries
 */

export { canonicalize, type CanonicalizeOptions, type CanonicalizeResult } from "./transformer";
export { desugar } from "./desugar";
export { normalize } from "./normalize";
export { annotateEffects, type EffectAnnotation } from "./effects";
export { insertValidators } from "./validators";
