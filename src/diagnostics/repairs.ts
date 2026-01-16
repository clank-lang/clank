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
  Decl,
  Stmt,
  Expr,
  FnDecl,
  LetStmt,
  BlockExpr,
  AstNode,
} from "../parser/ast";
import { ErrorCode } from "./codes";

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
  private nodeById = new Map<string, AstNode>();
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

  private indexNode(node: AstNode): void {
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
      case ErrorCode.ImmutableAssign:
        this.repairImmutableAssign(diag);
        break;
      case ErrorCode.EffectNotAllowed:
        this.repairEffectNotAllowed(diag);
        break;
      case ErrorCode.UnhandledEffect:
        this.repairUnhandledEffect(diag);
        break;
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

  // ===========================================================================
  // Obligation Repairs
  // ===========================================================================

  private generateForObligation(_obl: Obligation): void {
    // TODO: Convert obligation hints to repair candidates
    // For now, obligations don't generate repairs
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

  private addRepairForHole(holeId: string, repair: RepairCandidate): void {
    this.repairs.push(repair);
    const existing = this.holeRepairs.get(holeId) ?? [];
    existing.push(repair.id);
    this.holeRepairs.set(holeId, existing);
  }
}
