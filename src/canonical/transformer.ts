/**
 * Canonical AST Transformer
 *
 * Orchestrates the transformation of parsed AST into canonical form.
 */

import type { Program } from "../parser/ast";
import type { Type } from "../types/types";
import { desugar } from "./desugar";
import { normalize } from "./normalize";
import { annotateEffects, type EffectAnnotations } from "./effects";
import { insertValidators } from "./validators";
import { cloneProgram } from "./clone";

// =============================================================================
// Types
// =============================================================================

export interface CanonicalizeOptions {
  /** Perform desugaring (Unicode normalization, pipe expansion, etc.) */
  desugar?: boolean;
  /** Normalize structure (explicit else, explicit returns) */
  normalize?: boolean;
  /** Annotate expressions with inferred effects */
  annotateEffects?: boolean;
  /** Insert runtime validators at type boundaries */
  insertValidators?: boolean;
  /** Type information from the type checker (required for effect annotation) */
  typeInfo?: Map<string, Type>;
  /** Effect information from the type checker */
  effectInfo?: Map<string, Set<string>>;
}

export interface CanonicalizeResult {
  /** The canonical AST */
  program: Program;
  /** Effect annotations added to expressions */
  effectAnnotations: EffectAnnotations;
  /** IDs of nodes where validators were inserted */
  validatorInsertions: string[];
}

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_OPTIONS: Required<Omit<CanonicalizeOptions, "typeInfo" | "effectInfo">> = {
  desugar: true,
  normalize: true,
  annotateEffects: true,
  insertValidators: true,
};

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Transform a parsed AST into canonical form.
 *
 * The canonical AST is the authoritative representation that agents should
 * operate on. It includes:
 * - Desugared syntax (ASCII operators, expanded pipes)
 * - Normalized structure (explicit else branches, returns)
 * - Effect annotations on expressions
 * - Runtime validators at type boundaries
 *
 * @param program The parsed AST
 * @param options Transformation options
 * @returns The canonical AST and metadata about transformations
 */
export function canonicalize(
  program: Program,
  options: CanonicalizeOptions = {}
): CanonicalizeResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Clone the program to avoid mutating the original
  let result = cloneProgram(program);
  let effectAnnotations: EffectAnnotations = new Map();
  let validatorInsertions: string[] = [];

  // Phase 1: Desugaring
  if (opts.desugar) {
    result = desugar(result);
  }

  // Phase 2: Normalization
  if (opts.normalize) {
    result = normalize(result);
  }

  // Phase 3: Effect annotation
  if (opts.annotateEffects && opts.effectInfo) {
    const effectResult = annotateEffects(result, opts.effectInfo);
    effectAnnotations = effectResult.annotations;
  }

  // Phase 4: Validator insertion
  if (opts.insertValidators && opts.typeInfo) {
    const validatorResult = insertValidators(result, opts.typeInfo);
    result = validatorResult.program;
    validatorInsertions = validatorResult.insertions;
  }

  return {
    program: result,
    effectAnnotations,
    validatorInsertions,
  };
}
