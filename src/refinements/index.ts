/**
 * Refinements Module
 *
 * Provides constraint extraction, solving, and context management
 * for refinement type checking.
 */

export { extractPredicate, extractTerm, substitutePredicate, substituteTerm, substituteVarWithTermInPredicate } from "./extract";
export { solve, type SolverResult } from "./solver";
export { RefinementContext, ContextBuilder, type Fact } from "./context";
export { generateHints, type HintContext } from "./hints";
