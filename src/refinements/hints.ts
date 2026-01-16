/**
 * Hint Generation for Unprovable Obligations
 *
 * Generates actionable hints when the solver cannot prove a refinement obligation.
 * Hints suggest fixes like guards, parameter refinements, or assertions.
 */

import type { RefinementPredicate, RefinementTerm, Type } from "../types/types";
import { formatPredicate, formatType } from "../types/types";
import type { Hint } from "../diagnostics";
import type { Fact } from "./context";
import type { Binding } from "../types/context";

// =============================================================================
// Hint Context
// =============================================================================

export interface HintContext {
  /** The unprovable goal predicate */
  goal: RefinementPredicate;
  /** Known facts from refinement context */
  facts: Fact[];
  /** Variable bindings in scope */
  bindings: Map<string, Binding>;
  /** Variable definitions (e.g., m = n + 1) */
  definitions: Map<string, RefinementTerm>;
}

// =============================================================================
// Main Hint Generation
// =============================================================================

/**
 * Generate hints for an unprovable obligation.
 */
export function generateHints(ctx: HintContext): Hint[] {
  const hints: Hint[] = [];
  const vars = extractVariablesFromPredicate(ctx.goal);

  // 1. Guard hint - always applicable
  hints.push({
    strategy: "guard",
    description: "Add a guard to check the condition",
    template: `if ${formatPredicate(ctx.goal)} { ... }`,
    confidence: "high",
  });

  // 2. Parameter refinement hints
  for (const varName of vars) {
    const binding = ctx.bindings.get(varName);
    if (binding && binding.source === "parameter") {
      const typeStr = formatBindingType(binding);
      hints.push({
        strategy: "refine_param",
        description: `Strengthen parameter '${varName}' with refinement`,
        template: `${varName}: ${typeStr}{${formatPredicate(ctx.goal)}}`,
        confidence: "medium",
      });
    }
  }

  // 3. Assert hint - for assuming the condition
  hints.push({
    strategy: "assert",
    description: "Add an assertion to assume the condition",
    template: `assert ${formatPredicate(ctx.goal)}`,
    confidence: "medium",
  });

  // 4. Info hint - what's known about variables
  hints.push(generateInfoHint(vars, ctx));

  return hints;
}

// =============================================================================
// Variable Extraction
// =============================================================================

/**
 * Extract all variable names referenced in a predicate.
 */
function extractVariablesFromPredicate(pred: RefinementPredicate): Set<string> {
  const vars = new Set<string>();

  function extractFromTerm(term: RefinementTerm): void {
    switch (term.kind) {
      case "var":
        vars.add(term.name);
        break;
      case "binop":
        extractFromTerm(term.left);
        extractFromTerm(term.right);
        break;
      case "call":
        for (const arg of term.args) {
          extractFromTerm(arg);
        }
        break;
      case "field":
        extractFromTerm(term.base);
        break;
      case "int":
      case "bool":
      case "string":
        // No variables
        break;
    }
  }

  function extract(p: RefinementPredicate): void {
    switch (p.kind) {
      case "compare":
        extractFromTerm(p.left);
        extractFromTerm(p.right);
        break;
      case "and":
      case "or":
        extract(p.left);
        extract(p.right);
        break;
      case "not":
        extract(p.inner);
        break;
      case "call":
        for (const arg of p.args) {
          extractFromTerm(arg);
        }
        break;
      case "true":
      case "false":
      case "unknown":
        // No variables
        break;
    }
  }

  extract(pred);
  return vars;
}

// =============================================================================
// Info Hint Generation
// =============================================================================

/**
 * Generate an info hint listing what's known about the variables.
 */
function generateInfoHint(vars: Set<string>, ctx: HintContext): Hint {
  const varInfoParts: string[] = [];

  for (const varName of vars) {
    const knownFacts = findFactsAboutVariable(varName, ctx.facts);
    const definition = ctx.definitions.get(varName);
    const binding = ctx.bindings.get(varName);

    if (knownFacts.length > 0 || definition || binding) {
      const parts: string[] = [];

      // Add type info
      if (binding) {
        parts.push(`type: ${formatBindingType(binding)}`);
      }

      // Add definition info
      if (definition) {
        parts.push(`defined as: ${formatTerm(definition)}`);
      }

      // Add known facts
      if (knownFacts.length > 0) {
        parts.push(`known: ${knownFacts.map(f => formatPredicate(f.predicate)).join(", ")}`);
      }

      if (parts.length > 0) {
        varInfoParts.push(`${varName}: ${parts.join("; ")}`);
      } else {
        varInfoParts.push(`${varName}: no constraints`);
      }
    } else {
      varInfoParts.push(`${varName}: no constraints`);
    }
  }

  const description = varInfoParts.length > 0
    ? `Known facts: ${varInfoParts.join(" | ")}`
    : "No variables with known constraints";

  return {
    strategy: "info",
    description,
    confidence: "low",
  };
}

/**
 * Find all facts that mention a specific variable.
 */
function findFactsAboutVariable(varName: string, facts: Fact[]): Fact[] {
  return facts.filter(f => {
    const vars = extractVariablesFromPredicate(f.predicate);
    return vars.has(varName);
  });
}

// =============================================================================
// Formatting Helpers
// =============================================================================

/**
 * Format a binding's type for display.
 */
function formatBindingType(binding: Binding): string {
  const type = binding.type;
  if (typeof type === "object" && "kind" in type) {
    // It's a Type
    return formatType(type as Type);
  }
  if (typeof type === "object" && "typeParams" in type) {
    // It's a TypeScheme
    return formatType((type as { typeParams: string[]; type: Type }).type);
  }
  return "unknown";
}

/**
 * Format a term for display.
 */
function formatTerm(term: RefinementTerm): string {
  switch (term.kind) {
    case "var":
      return term.name;
    case "int":
      return term.value.toString();
    case "bool":
      return term.value.toString();
    case "string":
      return `"${term.value}"`;
    case "binop":
      return `(${formatTerm(term.left)} ${term.op} ${formatTerm(term.right)})`;
    case "call":
      return `${term.name}(${term.args.map(formatTerm).join(", ")})`;
    case "field":
      return `${formatTerm(term.base)}.${term.field}`;
  }
}
