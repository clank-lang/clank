/**
 * Effect Annotation
 *
 * Annotates AST nodes with their inferred effects from the type checker.
 * This information is stored externally (not in the AST nodes themselves)
 * to preserve the AST structure while providing effect metadata.
 */

import type {
  Program,
  Decl,
  Stmt,
  Expr,
  BlockExpr,
  FnDecl,
} from "../parser/ast";

// =============================================================================
// Types
// =============================================================================

/** Map from node ID to the effects that expression produces */
export type EffectAnnotations = Map<string, EffectAnnotation>;

export interface EffectAnnotation {
  /** Effects produced by this expression */
  effects: Set<string>;
  /** Whether this expression performs IO */
  hasIO: boolean;
  /** Whether this expression can produce errors */
  hasErr: boolean;
  /** Whether this expression is async */
  hasAsync: boolean;
  /** Whether this expression uses mutable state */
  hasMut: boolean;
}

export interface AnnotateEffectsResult {
  /** Effect annotations for all nodes */
  annotations: EffectAnnotations;
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Annotate a program with effect information.
 *
 * This doesn't modify the AST - it produces a separate map of annotations
 * that can be queried alongside the canonical AST.
 *
 * @param program The program to annotate
 * @param effectInfo Effect information from the type checker (function name → effects)
 */
export function annotateEffects(
  program: Program,
  effectInfo: Map<string, Set<string>>
): AnnotateEffectsResult {
  const collector = new EffectCollector(effectInfo);
  collector.visitProgram(program);

  return {
    annotations: collector.annotations,
  };
}

// =============================================================================
// Effect Collector
// =============================================================================

class EffectCollector {
  annotations: EffectAnnotations = new Map();
  private effectInfo: Map<string, Set<string>>;

  constructor(effectInfo: Map<string, Set<string>>) {
    this.effectInfo = effectInfo;
  }

  visitProgram(program: Program): void {
    for (const decl of program.declarations) {
      this.visitDecl(decl);
    }
  }

  private visitDecl(decl: Decl): void {
    switch (decl.kind) {
      case "fn":
        this.visitFnDecl(decl);
        break;
      // Other declarations don't contain effect-producing code
    }
  }

  private visitFnDecl(decl: FnDecl): void {
    // Get the declared effects for this function
    const declaredEffects = this.effectInfo.get(decl.name) ?? new Set();

    // Visit the body
    this.visitBlockExpr(decl.body);

    // Annotate the function declaration itself
    this.annotate(decl.id, declaredEffects);
  }

  private visitStmt(stmt: Stmt): Set<string> {
    switch (stmt.kind) {
      case "expr":
        return this.visitExpr(stmt.expr);

      case "let":
        return this.visitExpr(stmt.init);

      case "assign":
        // Assignment involves mutation
        const assignEffects = this.visitExpr(stmt.value);
        assignEffects.add("Mut");
        this.annotate(stmt.id, assignEffects);
        return assignEffects;

      case "for":
        const forEffects = new Set<string>();
        this.mergeEffects(forEffects, this.visitExpr(stmt.iterable));
        this.mergeEffects(forEffects, this.visitBlockExpr(stmt.body));
        this.annotate(stmt.id, forEffects);
        return forEffects;

      case "while":
        const whileEffects = new Set<string>();
        this.mergeEffects(whileEffects, this.visitExpr(stmt.condition));
        this.mergeEffects(whileEffects, this.visitBlockExpr(stmt.body));
        this.annotate(stmt.id, whileEffects);
        return whileEffects;

      case "loop":
        const loopEffects = this.visitBlockExpr(stmt.body);
        this.annotate(stmt.id, loopEffects);
        return loopEffects;

      case "return":
        if (stmt.value) {
          const returnEffects = this.visitExpr(stmt.value);
          this.annotate(stmt.id, returnEffects);
          return returnEffects;
        }
        return new Set();

      case "break":
      case "continue":
        return new Set();

      case "assert":
        const assertEffects = this.visitExpr(stmt.condition);
        this.annotate(stmt.id, assertEffects);
        return assertEffects;
    }
  }

  private visitExpr(expr: Expr): Set<string> {
    let effects: Set<string>;

    switch (expr.kind) {
      case "literal":
      case "ident":
        effects = new Set();
        break;

      case "unary":
        effects = this.visitExpr(expr.operand);
        break;

      case "binary":
        effects = new Set();
        this.mergeEffects(effects, this.visitExpr(expr.left));
        this.mergeEffects(effects, this.visitExpr(expr.right));
        break;

      case "call":
        effects = this.visitCallExpr(expr);
        break;

      case "index":
        effects = new Set();
        this.mergeEffects(effects, this.visitExpr(expr.object));
        this.mergeEffects(effects, this.visitExpr(expr.index));
        break;

      case "field":
        effects = this.visitExpr(expr.object);
        break;

      case "lambda":
        // Lambda body effects are captured, not executed here
        this.visitExpr(expr.body);
        effects = new Set();
        break;

      case "if":
        effects = new Set();
        this.mergeEffects(effects, this.visitExpr(expr.condition));
        this.mergeEffects(effects, this.visitBlockExpr(expr.thenBranch));
        if (expr.elseBranch) {
          if (expr.elseBranch.kind === "if") {
            this.mergeEffects(effects, this.visitExpr(expr.elseBranch));
          } else {
            this.mergeEffects(effects, this.visitBlockExpr(expr.elseBranch));
          }
        }
        break;

      case "match":
        effects = new Set();
        this.mergeEffects(effects, this.visitExpr(expr.scrutinee));
        for (const arm of expr.arms) {
          if (arm.guard) {
            this.mergeEffects(effects, this.visitExpr(arm.guard));
          }
          this.mergeEffects(effects, this.visitExpr(arm.body));
        }
        break;

      case "block":
        effects = this.visitBlockExpr(expr);
        break;

      case "array":
        effects = new Set();
        for (const elem of expr.elements) {
          this.mergeEffects(effects, this.visitExpr(elem));
        }
        break;

      case "tuple":
        effects = new Set();
        for (const elem of expr.elements) {
          this.mergeEffects(effects, this.visitExpr(elem));
        }
        break;

      case "record":
        effects = new Set();
        for (const field of expr.fields) {
          this.mergeEffects(effects, this.visitExpr(field.value));
        }
        break;

      case "range":
        effects = new Set();
        this.mergeEffects(effects, this.visitExpr(expr.start));
        this.mergeEffects(effects, this.visitExpr(expr.end));
        break;

      case "propagate":
        effects = this.visitExpr(expr.expr);
        effects.add("Err");
        break;
    }

    this.annotate(expr.id, effects);
    return effects;
  }

  private visitCallExpr(expr: Extract<Expr, { kind: "call" }>): Set<string> {
    const effects = new Set<string>();

    // Collect effects from arguments
    for (const arg of expr.args) {
      this.mergeEffects(effects, this.visitExpr(arg));
    }

    // Get effects from the callee
    const calleeEffects = this.visitExpr(expr.callee);
    this.mergeEffects(effects, calleeEffects);

    // If the callee is an identifier, look up its declared effects
    if (expr.callee.kind === "ident") {
      const fnEffects = this.effectInfo.get(expr.callee.name);
      if (fnEffects) {
        this.mergeEffects(effects, fnEffects);
      }
    }

    return effects;
  }

  private visitBlockExpr(block: BlockExpr): Set<string> {
    const effects = new Set<string>();

    for (const stmt of block.statements) {
      this.mergeEffects(effects, this.visitStmt(stmt));
    }

    if (block.expr) {
      this.mergeEffects(effects, this.visitExpr(block.expr));
    }

    this.annotate(block.id, effects);
    return effects;
  }

  private annotate(nodeId: string, effects: Set<string>): void {
    this.annotations.set(nodeId, {
      effects,
      hasIO: effects.has("IO"),
      hasErr: effects.has("Err"),
      hasAsync: effects.has("Async"),
      hasMut: effects.has("Mut"),
    });
  }

  private mergeEffects(target: Set<string>, source: Set<string>): void {
    for (const effect of source) {
      target.add(effect);
    }
  }
}
