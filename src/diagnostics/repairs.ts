/**
 * Repair Generator
 *
 * Generates machine-actionable repair candidates for compiler errors.
 * Each repair contains PatchOps that agents can apply to fix issues.
 */

import type {
  Diagnostic,
  Obligation,
  TypeHole,
  RepairCandidate,
  RepairConfidence,
  RepairSafety,
  RepairKind,
  PatchOp,
} from "./diagnostic";
import type {
  Program,
  Stmt,
  Expr,
  Decl,
  FnDecl,
  LetStmt,
  BlockExpr,
  MatchExpr,
  RecordExpr,
  CallExpr,
} from "../parser/ast";
import { ErrorCode } from "./codes";
import type { Hint } from "./diagnostic";

// Union type for all node types we store and look up
type IndexedNode = Expr | Stmt | Decl;

// =============================================================================
// Types
// =============================================================================

export interface RepairContext {
  program: Program;
  diagnostics: Diagnostic[];
  obligations: Obligation[];
  holes: TypeHole[];
}

export interface RepairResult {
  repairs: RepairCandidate[];
  diagnosticRepairs: Map<string, string[]>;
  obligationRepairs: Map<string, string[]>;
  holeRepairs: Map<string, string[]>;
}

// =============================================================================
// Main Entry Point
// =============================================================================

export function generateRepairs(ctx: RepairContext): RepairResult {
  const generator = new RepairGenerator(ctx);
  return generator.generate();
}

// =============================================================================
// Repair Generator
// =============================================================================

class RepairGenerator {
  private repairs: RepairCandidate[] = [];
  private repairIdCounter = 0;
  private diagnosticRepairs = new Map<string, string[]>();
  private obligationRepairs = new Map<string, string[]>();
  private holeRepairs = new Map<string, string[]>();

  // Cache for AST lookups
  private nodeById = new Map<string, IndexedNode>();
  private letStmtsByName = new Map<string, LetStmt>();
  private fnDeclsByName = new Map<string, FnDecl>();

  constructor(private ctx: RepairContext) {
    this.indexAst();
  }

  generate(): RepairResult {
    for (const diag of this.ctx.diagnostics) {
      this.generateForDiagnostic(diag);
    }

    for (const obl of this.ctx.obligations) {
      this.generateForObligation(obl);
    }

    return {
      repairs: this.repairs,
      diagnosticRepairs: this.diagnosticRepairs,
      obligationRepairs: this.obligationRepairs,
      holeRepairs: this.holeRepairs,
    };
  }

  // ===========================================================================
  // AST Indexing
  // ===========================================================================

  private indexAst(): void {
    for (const decl of this.ctx.program.declarations) {
      this.indexNode(decl);
      if (decl.kind === "fn") {
        this.fnDeclsByName.set(decl.name, decl);
        this.indexBlock(decl.body);
      }
    }
  }

  private indexNode(node: IndexedNode): void {
    this.nodeById.set(node.id, node);
  }

  private indexBlock(block: BlockExpr): void {
    this.indexNode(block);
    for (const stmt of block.statements) {
      this.indexStmt(stmt);
    }
    if (block.expr) {
      this.indexExpr(block.expr);
    }
  }

  private indexStmt(stmt: Stmt): void {
    this.indexNode(stmt);
    switch (stmt.kind) {
      case "let":
        if (stmt.pattern.kind === "ident") {
          this.letStmtsByName.set(stmt.pattern.name, stmt);
        }
        this.indexExpr(stmt.init);
        break;
      case "assign":
        this.indexExpr(stmt.target);
        this.indexExpr(stmt.value);
        break;
      case "expr":
        this.indexExpr(stmt.expr);
        break;
      case "for":
        this.indexExpr(stmt.iterable);
        this.indexBlock(stmt.body);
        break;
      case "while":
        this.indexExpr(stmt.condition);
        this.indexBlock(stmt.body);
        break;
      case "loop":
        this.indexBlock(stmt.body);
        break;
      case "return":
        if (stmt.value) this.indexExpr(stmt.value);
        break;
      case "assert":
        this.indexExpr(stmt.condition);
        break;
    }
  }

  private indexExpr(expr: Expr): void {
    this.indexNode(expr);
    switch (expr.kind) {
      case "binary":
        this.indexExpr(expr.left);
        this.indexExpr(expr.right);
        break;
      case "unary":
        this.indexExpr(expr.operand);
        break;
      case "call":
        this.indexExpr(expr.callee);
        for (const arg of expr.args) this.indexExpr(arg);
        break;
      case "lambda":
        this.indexExpr(expr.body);
        break;
      case "if":
        this.indexExpr(expr.condition);
        this.indexBlock(expr.thenBranch);
        if (expr.elseBranch) {
          if (expr.elseBranch.kind === "block") {
            this.indexBlock(expr.elseBranch);
          } else {
            this.indexExpr(expr.elseBranch);
          }
        }
        break;
      case "match":
        this.indexExpr(expr.scrutinee);
        for (const arm of expr.arms) {
          if (arm.guard) this.indexExpr(arm.guard);
          this.indexExpr(arm.body);
        }
        break;
      case "block":
        this.indexBlock(expr);
        break;
      case "array":
        for (const elem of expr.elements) this.indexExpr(elem);
        break;
      case "tuple":
        for (const elem of expr.elements) this.indexExpr(elem);
        break;
      case "record":
        for (const field of expr.fields) this.indexExpr(field.value);
        break;
      case "index":
        this.indexExpr(expr.object);
        this.indexExpr(expr.index);
        break;
      case "field":
        this.indexExpr(expr.object);
        break;
      case "propagate":
        this.indexExpr(expr.expr);
        break;
      case "range":
        this.indexExpr(expr.start);
        this.indexExpr(expr.end);
        break;
    }
  }

  // ===========================================================================
  // Diagnostic Repairs
  // ===========================================================================

  private generateForDiagnostic(diag: Diagnostic): void {
    switch (diag.code) {
      case ErrorCode.UnresolvedName:
        this.repairUnresolvedName(diag);
        break;
      case ErrorCode.UnresolvedType:
        this.repairUnresolvedType(diag);
        break;
      case ErrorCode.TypeMismatch:
        this.repairTypeMismatch(diag);
        break;
      case ErrorCode.ArityMismatch:
        this.repairArityMismatch(diag);
        break;
      case ErrorCode.MissingField:
        this.repairMissingField(diag);
        break;
      case ErrorCode.UnknownField:
        this.repairUnknownField(diag);
        break;
      case ErrorCode.ImmutableAssign:
        this.repairImmutableAssign(diag);
        break;
      case ErrorCode.NonExhaustiveMatch:
        this.repairNonExhaustiveMatch(diag);
        break;
      case ErrorCode.EffectNotAllowed:
        this.repairEffectNotAllowed(diag);
        break;
      case ErrorCode.UnhandledEffect:
        this.repairUnhandledEffect(diag);
        break;
      case ErrorCode.UnusedVariable:
        this.repairUnusedVariable(diag);
        break;
    }
  }

  /**
   * E1001: Unresolved name
   * Repair: Rename to a similar name that exists in scope
   */
  private repairUnresolvedName(diag: Diagnostic): void {
    const name = diag.structured.name as string | undefined;
    const similarNames = diag.structured.similar_names as string[] | undefined;

    if (!name || !similarNames || similarNames.length === 0) return;
    if (!diag.primary_node_id) return;

    const node = this.nodeById.get(diag.primary_node_id);
    if (!node || node.kind !== "ident") return;

    // Generate a repair for each similar name suggestion
    for (const suggestion of similarNames) {
      const confidence = similarNames[0] === suggestion ? "high" : "medium";

      const repair = this.createRepair({
        title: `Rename '${name}' to '${suggestion}'`,
        confidence,
        safety: "behavior_changing",
        kind: "local_fix",
        nodeCount: 1,
        crossesFunction: false,
        targetNodeIds: [diag.primary_node_id],
        diagnosticCodes: [ErrorCode.UnresolvedName],
        edits: [
          {
            op: "rename_symbol",
            node_id: diag.primary_node_id,
            old_name: name,
            new_name: suggestion,
          },
        ],
        diagnosticsResolved: [diag.id],
        rationale: `'${name}' is not defined. Did you mean '${suggestion}'?`,
      });

      this.addRepairForDiagnostic(diag.id, repair);
    }
  }

  /**
   * E1005: Unresolved type
   * Repair: Rename to a similar type name that exists
   */
  private repairUnresolvedType(diag: Diagnostic): void {
    const name = diag.structured.name as string | undefined;
    const similarTypes = diag.structured.similar_types as string[] | undefined;

    if (!name || !similarTypes || similarTypes.length === 0) return;

    // Generate a repair for each similar type suggestion
    for (const suggestion of similarTypes) {
      const confidence = similarTypes[0] === suggestion ? "high" : "medium";

      const repair = this.createRepair({
        title: `Change type '${name}' to '${suggestion}'`,
        confidence,
        safety: "behavior_changing",
        kind: "local_fix",
        nodeCount: 1,
        crossesFunction: false,
        targetNodeIds: diag.primary_node_id ? [diag.primary_node_id] : [],
        diagnosticCodes: [ErrorCode.UnresolvedType],
        edits: [
          {
            op: "rename_symbol",
            node_id: diag.primary_node_id ?? "",
            old_name: name,
            new_name: suggestion,
          },
        ],
        diagnosticsResolved: [diag.id],
        rationale: `Type '${name}' is not defined. Did you mean '${suggestion}'?`,
      });

      this.addRepairForDiagnostic(diag.id, repair);
    }
  }

  /**
   * E2001: Type mismatch
   * Repair: Suggest type annotation or conversion
   */
  private repairTypeMismatch(diag: Diagnostic): void {
    const expected = diag.structured.expected as string | undefined;
    const actual = diag.structured.actual as string | undefined;

    if (!expected || !actual) return;
    if (!diag.primary_node_id) return;

    const node = this.nodeById.get(diag.primary_node_id);
    if (!node) return;

    // Check for common conversion patterns
    const conversions = this.findTypeConversions(actual, expected);

    for (const conversion of conversions) {
      const repair = this.createRepair({
        title: conversion.title,
        confidence: conversion.confidence,
        safety: "behavior_changing",
        kind: "local_fix",
        nodeCount: 1,
        crossesFunction: false,
        targetNodeIds: [diag.primary_node_id],
        diagnosticCodes: [ErrorCode.TypeMismatch],
        edits: [
          {
            op: "wrap",
            node_id: diag.primary_node_id,
            wrapper: conversion.wrapper,
            hole_ref: "expr",
          },
        ],
        diagnosticsResolved: [diag.id],
        rationale: conversion.rationale,
      });

      this.addRepairForDiagnostic(diag.id, repair);
    }
  }

  /**
   * Find type conversion functions for common type pairs.
   */
  private findTypeConversions(
    from: string,
    to: string
  ): Array<{
    title: string;
    confidence: RepairConfidence;
    wrapper: unknown;
    rationale: string;
  }> {
    const conversions: Array<{
      title: string;
      confidence: RepairConfidence;
      wrapper: unknown;
      rationale: string;
    }> = [];

    // Int -> Float
    if ((from === "Int" || from === "ℤ") && (to === "Float" || to === "ℝ")) {
      conversions.push({
        title: "Convert Int to Float using int_to_float",
        confidence: "high",
        wrapper: {
          kind: "call",
          callee: { kind: "ident", name: "int_to_float" },
          args: [{ kind: "hole", ref: "expr" }],
        },
        rationale: "Use int_to_float() to convert integer to floating point.",
      });
    }

    // Float -> Int
    if ((from === "Float" || from === "ℝ") && (to === "Int" || to === "ℤ")) {
      conversions.push({
        title: "Convert Float to Int using float_to_int (truncates)",
        confidence: "medium",
        wrapper: {
          kind: "call",
          callee: { kind: "ident", name: "float_to_int" },
          args: [{ kind: "hole", ref: "expr" }],
        },
        rationale: "Use float_to_int() to convert float to integer. Note: this truncates toward zero.",
      });
    }

    // Any -> String via to_string
    if (to === "String" || to === "Str") {
      conversions.push({
        title: "Convert to String using to_string",
        confidence: "medium",
        wrapper: {
          kind: "call",
          callee: { kind: "ident", name: "to_string" },
          args: [{ kind: "hole", ref: "expr" }],
        },
        rationale: "Use to_string() to convert the value to a string representation.",
      });
    }

    return conversions;
  }

  /**
   * E2002: Arity mismatch
   * Repair: Add or remove arguments to match expected count
   */
  private repairArityMismatch(diag: Diagnostic): void {
    const expected = parseInt(diag.structured.expected as string, 10);
    const actual = parseInt(diag.structured.actual as string, 10);

    if (isNaN(expected) || isNaN(actual)) return;
    if (!diag.primary_node_id) return;

    const node = this.nodeById.get(diag.primary_node_id);
    if (!node || node.kind !== "call") return;

    const callExpr = node as CallExpr;

    if (actual < expected) {
      // Need to add placeholder arguments
      const missingCount = expected - actual;
      const newArgs = [...callExpr.args];
      for (let i = 0; i < missingCount; i++) {
        newArgs.push({
          kind: "ident" as const,
          name: `_arg${actual + i + 1}`,
          span: callExpr.span,
          id: `placeholder_${i}`,
        });
      }

      const repair = this.createRepair({
        title: `Add ${missingCount} placeholder argument${missingCount > 1 ? "s" : ""}`,
        confidence: "medium",
        safety: "behavior_changing",
        kind: "local_fix",
        nodeCount: 1,
        crossesFunction: false,
        targetNodeIds: [diag.primary_node_id],
        diagnosticCodes: [ErrorCode.ArityMismatch],
        edits: [
          {
            op: "replace_node",
            node_id: diag.primary_node_id,
            new_node: {
              kind: "call",
              callee: callExpr.callee,
              args: newArgs,
            },
          },
        ],
        diagnosticsResolved: [diag.id],
        rationale: `Function expects ${expected} arguments but got ${actual}. Added placeholder arguments that need to be filled in.`,
      });

      this.addRepairForDiagnostic(diag.id, repair);
    } else if (actual > expected) {
      // Need to remove extra arguments
      const excessCount = actual - expected;
      const newArgs = callExpr.args.slice(0, expected);

      const repair = this.createRepair({
        title: `Remove ${excessCount} extra argument${excessCount > 1 ? "s" : ""}`,
        confidence: "medium",
        safety: "behavior_changing",
        kind: "local_fix",
        nodeCount: 1,
        crossesFunction: false,
        targetNodeIds: [diag.primary_node_id],
        diagnosticCodes: [ErrorCode.ArityMismatch],
        edits: [
          {
            op: "replace_node",
            node_id: diag.primary_node_id,
            new_node: {
              kind: "call",
              callee: callExpr.callee,
              args: newArgs,
            },
          },
        ],
        diagnosticsResolved: [diag.id],
        rationale: `Function expects ${expected} arguments but got ${actual}. Removed the extra arguments.`,
      });

      this.addRepairForDiagnostic(diag.id, repair);
    }
  }

  /**
   * E2003: Missing field in record expression
   * Repair: Insert field with placeholder value
   */
  private repairMissingField(diag: Diagnostic): void {
    const fieldName = diag.structured.details as string | undefined;
    if (!fieldName) return;
    if (!diag.primary_node_id) return;

    const node = this.nodeById.get(diag.primary_node_id);
    if (!node || node.kind !== "record") return;

    const recordExpr = node as RecordExpr;

    // Create a placeholder value
    const placeholderValue = {
      kind: "ident" as const,
      name: `_${fieldName}`,
      span: recordExpr.span,
      id: `placeholder_${fieldName}`,
    };

    const newFields = [
      ...recordExpr.fields,
      { name: fieldName, value: placeholderValue, span: recordExpr.span },
    ];

    const repair = this.createRepair({
      title: `Add missing field '${fieldName}'`,
      confidence: "high",
      safety: "behavior_changing",
      kind: "local_fix",
      nodeCount: 1,
      crossesFunction: false,
      targetNodeIds: [diag.primary_node_id],
      diagnosticCodes: [ErrorCode.MissingField],
      edits: [
        {
          op: "replace_node",
          node_id: diag.primary_node_id,
          new_node: {
            kind: "record",
            fields: newFields,
          },
        },
      ],
      diagnosticsResolved: [diag.id],
      rationale: `Record is missing required field '${fieldName}'. Added with placeholder value that needs to be filled in.`,
    });

    this.addRepairForDiagnostic(diag.id, repair);
  }

  /**
   * E2004: Unknown field
   * Repair: Rename to a similar field that exists on the type
   */
  private repairUnknownField(diag: Diagnostic): void {
    const field = diag.structured.field as string | undefined;
    const similarFields = diag.structured.similar_fields as string[] | undefined;

    if (!field || !similarFields || similarFields.length === 0) return;
    if (!diag.primary_node_id) return;

    const node = this.nodeById.get(diag.primary_node_id);
    if (!node) return;

    // Generate a repair for each similar field suggestion
    for (const suggestion of similarFields) {
      const confidence = similarFields[0] === suggestion ? "high" : "medium";

      const repair = this.createRepair({
        title: `Rename field '${field}' to '${suggestion}'`,
        confidence,
        safety: "behavior_changing",
        kind: "local_fix",
        nodeCount: 1,
        crossesFunction: false,
        targetNodeIds: [diag.primary_node_id],
        diagnosticCodes: [ErrorCode.UnknownField],
        edits: [
          {
            op: "rename_field",
            node_id: diag.primary_node_id,
            old_name: field,
            new_name: suggestion,
          },
        ],
        diagnosticsResolved: [diag.id],
        rationale: `Field '${field}' does not exist. Did you mean '${suggestion}'?`,
      });

      this.addRepairForDiagnostic(diag.id, repair);
    }
  }

  /**
   * E2013: Assignment to immutable variable
   * Repair: Add `mut` to the variable declaration
   */
  private repairImmutableAssign(diag: Diagnostic): void {
    const varName = diag.structured.name as string | undefined;
    if (!varName) return;

    const letStmt = this.letStmtsByName.get(varName);
    if (!letStmt) return;

    // Create a new let statement with mutable: true
    const newLetStmt = {
      kind: "let" as const,
      pattern: letStmt.pattern,
      type: letStmt.type,
      init: letStmt.init,
      mutable: true,
    };

    const repair = this.createRepair({
      title: `Make '${varName}' mutable`,
      confidence: "high",
      safety: "behavior_preserving",
      kind: "local_fix",
      nodeCount: 1,
      crossesFunction: false,
      targetNodeIds: [letStmt.id],
      diagnosticCodes: [ErrorCode.ImmutableAssign],
      edits: [
        {
          op: "replace_node",
          node_id: letStmt.id,
          new_node: newLetStmt,
        },
      ],
      diagnosticsResolved: [diag.id],
      rationale: `Variable '${varName}' is assigned to but declared immutable. Adding 'mut' keyword allows reassignment.`,
    });

    this.addRepairForDiagnostic(diag.id, repair);
  }

  /**
   * E4001: Effect not allowed in function
   * Repair: Add the missing effect to function return type
   */
  private repairEffectNotAllowed(diag: Diagnostic): void {
    const effect = diag.structured.effect as string | undefined;
    const fnName = diag.structured.function as string | undefined;
    if (!effect || !fnName) return;

    const fnDecl = this.fnDeclsByName.get(fnName);
    if (!fnDecl) return;

    const repair = this.createRepair({
      title: `Add ${effect} effect to '${fnName}'`,
      confidence: "medium",
      safety: "likely_preserving",
      kind: "local_fix",
      nodeCount: 1,
      crossesFunction: false,
      targetNodeIds: [fnDecl.id],
      diagnosticCodes: [ErrorCode.EffectNotAllowed],
      edits: [
        {
          op: "widen_effect",
          fn_id: fnDecl.id,
          add_effects: [effect],
        },
      ],
      diagnosticsResolved: [diag.id],
      rationale: `Function '${fnName}' calls code with ${effect} effect but doesn't declare it. Adding the effect annotation makes this call valid.`,
    });

    this.addRepairForDiagnostic(diag.id, repair);
  }

  /**
   * E4002: Unhandled effect (e.g., using ? without Err effect)
   * Repair: Add Err effect to function return type
   */
  private repairUnhandledEffect(diag: Diagnostic): void {
    const effect = diag.structured.effect as string | undefined;
    const fnName = diag.structured.function as string | undefined;
    if (!effect || !fnName) return;

    const fnDecl = this.fnDeclsByName.get(fnName);
    if (!fnDecl) return;

    const repair = this.createRepair({
      title: `Add ${effect} effect to '${fnName}'`,
      confidence: "medium",
      safety: "likely_preserving",
      kind: "local_fix",
      nodeCount: 1,
      crossesFunction: false,
      targetNodeIds: [fnDecl.id],
      diagnosticCodes: [ErrorCode.UnhandledEffect],
      edits: [
        {
          op: "widen_effect",
          fn_id: fnDecl.id,
          add_effects: [effect],
        },
      ],
      diagnosticsResolved: [diag.id],
      rationale: `Error propagation (?) requires the function to declare ${effect} effect. Adding this effect allows error propagation.`,
    });

    this.addRepairForDiagnostic(diag.id, repair);
  }

  /**
   * E2015: Non-exhaustive match
   * Repair: Add wildcard arm to cover missing cases
   */
  private repairNonExhaustiveMatch(diag: Diagnostic): void {
    if (!diag.primary_node_id) return;

    const node = this.nodeById.get(diag.primary_node_id);
    if (!node || node.kind !== "match") return;

    const matchExpr = node as MatchExpr;

    // Add a wildcard arm with a placeholder body
    const wildcardArm = {
      pattern: { kind: "wildcard" as const, span: matchExpr.span, id: "wildcard_pattern" },
      body: {
        kind: "call" as const,
        callee: { kind: "ident" as const, name: "panic", span: matchExpr.span, id: "panic_callee" },
        args: [
          {
            kind: "literal" as const,
            value: { kind: "string" as const, value: "unhandled match case" },
            span: matchExpr.span,
            id: "panic_msg",
          },
        ],
        span: matchExpr.span,
        id: "panic_call",
      },
      span: matchExpr.span,
    };

    const repair = this.createRepair({
      title: "Add wildcard arm with panic",
      confidence: "medium",
      safety: "likely_preserving",
      kind: "local_fix",
      nodeCount: 1,
      crossesFunction: false,
      targetNodeIds: [diag.primary_node_id],
      diagnosticCodes: [ErrorCode.NonExhaustiveMatch],
      edits: [
        {
          op: "replace_node",
          node_id: diag.primary_node_id,
          new_node: {
            kind: "match",
            scrutinee: matchExpr.scrutinee,
            arms: [...matchExpr.arms, wildcardArm],
          },
        },
      ],
      diagnosticsResolved: [diag.id],
      rationale: "Match is not exhaustive. Added a wildcard arm that panics for unhandled cases. Replace with appropriate handling.",
    });

    this.addRepairForDiagnostic(diag.id, repair);
  }

  /**
   * W0001: Unused variable
   * Repair: Prefix with underscore to indicate intentionally unused
   */
  private repairUnusedVariable(diag: Diagnostic): void {
    const varName = diag.structured.name as string | undefined;
    if (!varName) return;
    if (varName.startsWith("_")) return; // Already prefixed

    const letStmt = this.letStmtsByName.get(varName);
    if (!letStmt) return;
    if (letStmt.pattern.kind !== "ident") return;

    const newName = `_${varName}`;

    const repair = this.createRepair({
      title: `Rename '${varName}' to '${newName}'`,
      confidence: "high",
      safety: "behavior_preserving",
      kind: "local_fix",
      nodeCount: 1,
      crossesFunction: false,
      targetNodeIds: [letStmt.id],
      diagnosticCodes: [ErrorCode.UnusedVariable],
      edits: [
        {
          op: "replace_node",
          node_id: letStmt.id,
          new_node: {
            kind: "let",
            pattern: { kind: "ident", name: newName },
            type: letStmt.type,
            init: letStmt.init,
            mutable: letStmt.mutable,
          },
        },
      ],
      diagnosticsResolved: [diag.id],
      rationale: `Variable '${varName}' is unused. Prefixing with underscore indicates it's intentionally unused.`,
    });

    this.addRepairForDiagnostic(diag.id, repair);
  }

  // ===========================================================================
  // Obligation Repairs
  // ===========================================================================

  private generateForObligation(obl: Obligation): void {
    // Convert obligation hints to repair candidates
    if (!obl.hints || obl.hints.length === 0) return;
    if (!obl.primary_node_id) return;

    for (const hint of obl.hints) {
      this.convertHintToRepair(obl, hint);
    }
  }

  /**
   * Convert a hint into a repair candidate.
   */
  private convertHintToRepair(obl: Obligation, hint: Hint): void {
    const nodeId = obl.primary_node_id;
    if (!nodeId) return;

    switch (hint.strategy) {
      case "guard":
        this.createGuardRepair(obl, hint);
        break;
      case "assert":
        this.createAssertRepair(obl, hint);
        break;
      case "refine_param":
        // Parameter refinement repairs are more complex and require function context
        // Skip for now as they need significant AST modification
        break;
      // "info" hints don't generate repairs
    }
  }

  /**
   * Create a repair that wraps the expression in a guard.
   */
  private createGuardRepair(obl: Obligation, hint: Hint): void {
    if (!obl.primary_node_id) return;
    if (!hint.template) return;

    const repair = this.createRepair({
      title: "Add guard condition",
      confidence: hint.confidence === "high" ? "high" : "medium",
      safety: "likely_preserving",
      kind: "local_fix",
      nodeCount: 1,
      crossesFunction: false,
      targetNodeIds: [obl.primary_node_id],
      diagnosticCodes: [],
      obligationIds: [obl.id],
      edits: [
        {
          op: "wrap",
          node_id: obl.primary_node_id,
          wrapper: {
            kind: "if",
            condition: { kind: "source", text: extractConditionFromGuard(hint.template) },
            thenBranch: { kind: "block", statements: [], expr: { kind: "hole", ref: "expr" } },
            elseBranch: null,
          },
          hole_ref: "expr",
        },
      ],
      diagnosticsResolved: [],
      obligationsDischarged: [obl.id],
      rationale: hint.description,
    });

    this.addRepairForObligation(obl.id, repair);
  }

  /**
   * Create a repair that adds an assertion before the expression.
   */
  private createAssertRepair(obl: Obligation, hint: Hint): void {
    if (!obl.primary_node_id) return;
    if (!hint.template) return;

    const repair = this.createRepair({
      title: "Add assertion",
      confidence: hint.confidence === "high" ? "high" : "medium",
      safety: "likely_preserving",
      kind: "local_fix",
      nodeCount: 1,
      crossesFunction: false,
      targetNodeIds: [obl.primary_node_id],
      diagnosticCodes: [],
      obligationIds: [obl.id],
      edits: [
        {
          op: "insert_before",
          target_id: obl.primary_node_id,
          new_statement: {
            kind: "assert",
            condition: { kind: "source", text: extractConditionFromAssert(hint.template) },
          },
        },
      ],
      diagnosticsResolved: [],
      obligationsDischarged: [obl.id],
      rationale: hint.description,
    });

    this.addRepairForObligation(obl.id, repair);
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private nextRepairId(): string {
    return `rc${++this.repairIdCounter}`;
  }

  private createRepair(opts: {
    title: string;
    confidence: RepairConfidence;
    safety: RepairSafety;
    kind: RepairKind;
    nodeCount: number;
    crossesFunction: boolean;
    targetNodeIds: string[];
    diagnosticCodes: string[];
    obligationIds?: string[];
    holeIds?: string[];
    edits: PatchOp[];
    diagnosticsResolved: string[];
    obligationsDischarged?: string[];
    holesFilled?: string[];
    rationale: string;
    preconditions?: { description: string; depends_on?: string[] }[];
  }): RepairCandidate {
    return {
      id: this.nextRepairId(),
      title: opts.title,
      confidence: opts.confidence,
      safety: opts.safety,
      kind: opts.kind,
      scope: {
        node_count: opts.nodeCount,
        crosses_function: opts.crossesFunction,
      },
      targets: {
        node_ids: opts.targetNodeIds,
        diagnostic_codes: opts.diagnosticCodes,
        obligation_ids: opts.obligationIds,
        hole_ids: opts.holeIds,
      },
      edits: opts.edits,
      expected_delta: {
        diagnostics_resolved: opts.diagnosticsResolved,
        obligations_discharged: opts.obligationsDischarged ?? [],
        holes_filled: opts.holesFilled ?? [],
      },
      rationale: opts.rationale,
      preconditions: opts.preconditions,
    };
  }

  private addRepairForDiagnostic(diagId: string, repair: RepairCandidate): void {
    this.repairs.push(repair);
    const existing = this.diagnosticRepairs.get(diagId) ?? [];
    existing.push(repair.id);
    this.diagnosticRepairs.set(diagId, existing);
  }

  private addRepairForObligation(oblId: string, repair: RepairCandidate): void {
    this.repairs.push(repair);
    const existing = this.obligationRepairs.get(oblId) ?? [];
    existing.push(repair.id);
    this.obligationRepairs.set(oblId, existing);
  }

  // @ts-ignore: Will be used when hole repairs are implemented
  private addRepairForHole(holeId: string, repair: RepairCandidate): void {
    this.repairs.push(repair);
    const existing = this.holeRepairs.get(holeId) ?? [];
    existing.push(repair.id);
    this.holeRepairs.set(holeId, existing);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Extract the condition expression from a guard hint template.
 * Template format: "if <condition> { ... }"
 */
function extractConditionFromGuard(template: string): string {
  const match = template.match(/^if\s+(.+?)\s*\{/);
  if (match) {
    return match[1];
  }
  return template;
}

/**
 * Extract the condition expression from an assert hint template.
 * Template format: "assert <condition>"
 */
function extractConditionFromAssert(template: string): string {
  const match = template.match(/^assert\s+(.+)$/);
  if (match) {
    return match[1];
  }
  return template;
}
