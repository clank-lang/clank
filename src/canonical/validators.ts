/**
 * Runtime Validator Insertion
 *
 * Inserts runtime type validators at boundaries where types are unknown
 * or when crossing FFI boundaries with external JavaScript code.
 *
 * Validators are inserted as wrapper calls around expressions:
 * - `__validate_int(expr)` for integer validation
 * - `__validate_string(expr)` for string validation
 * - `__validate_array(expr, elemValidator)` for array validation
 * - etc.
 */

import type {
  Program,
  Decl,
  Stmt,
  Expr,
  BlockExpr,
  FnDecl,
  CallExpr,
} from "../parser/ast";
import type { Type } from "../types/types";
import { generateNodeId } from "../parser/ast";
import type { SourceSpan } from "../utils/span";

// =============================================================================
// Types
// =============================================================================

export interface InsertValidatorsResult {
  /** The transformed program with validators inserted */
  program: Program;
  /** IDs of nodes where validators were inserted */
  insertions: string[];
}

// =============================================================================
// Main Entry Point
// =============================================================================

/**
 * Insert runtime validators at type boundaries.
 *
 * Validators are inserted at:
 * 1. Return values from external functions
 * 2. Values passed to external functions
 * 3. Dynamic type conversions
 *
 * @param program The program to transform
 * @param typeInfo Type information from the type checker
 */
export function insertValidators(
  program: Program,
  typeInfo: Map<string, Type>
): InsertValidatorsResult {
  const transformer = new ValidatorTransformer(typeInfo);
  const transformed = transformer.transformProgram(program);

  return {
    program: transformed,
    insertions: transformer.insertions,
  };
}

// =============================================================================
// Validator Transformer
// =============================================================================

class ValidatorTransformer {
  insertions: string[] = [];
  private typeInfo: Map<string, Type>;
  private externalFunctions: Set<string> = new Set();

  constructor(typeInfo: Map<string, Type>) {
    this.typeInfo = typeInfo;
  }

  transformProgram(program: Program): Program {
    // First pass: collect external function names
    for (const decl of program.declarations) {
      if (decl.kind === "externalFn") {
        this.externalFunctions.add(decl.name);
      }
    }

    // Second pass: transform declarations
    return {
      ...program,
      declarations: program.declarations.map((d) => this.transformDecl(d)),
    };
  }

  private transformDecl(decl: Decl): Decl {
    switch (decl.kind) {
      case "fn":
        return this.transformFnDecl(decl);
      default:
        return decl;
    }
  }

  private transformFnDecl(decl: FnDecl): FnDecl {
    return {
      ...decl,
      body: this.transformBlockExpr(decl.body),
    };
  }

  private transformStmt(stmt: Stmt): Stmt {
    switch (stmt.kind) {
      case "expr":
        return { ...stmt, expr: this.transformExpr(stmt.expr) };

      case "let":
        return { ...stmt, init: this.transformExpr(stmt.init) };

      case "assign":
        return {
          ...stmt,
          target: this.transformExpr(stmt.target),
          value: this.transformExpr(stmt.value),
        };

      case "for":
        return {
          ...stmt,
          iterable: this.transformExpr(stmt.iterable),
          body: this.transformBlockExpr(stmt.body),
        };

      case "while":
        return {
          ...stmt,
          condition: this.transformExpr(stmt.condition),
          body: this.transformBlockExpr(stmt.body),
        };

      case "loop":
        return { ...stmt, body: this.transformBlockExpr(stmt.body) };

      case "return":
        return {
          ...stmt,
          value: stmt.value ? this.transformExpr(stmt.value) : undefined,
        };

      case "break":
      case "continue":
        return stmt;

      case "assert":
        return { ...stmt, condition: this.transformExpr(stmt.condition) };
    }
  }

  private transformExpr(expr: Expr): Expr {
    switch (expr.kind) {
      case "literal":
      case "ident":
        return expr;

      case "unary":
        return { ...expr, operand: this.transformExpr(expr.operand) };

      case "binary":
        return {
          ...expr,
          left: this.transformExpr(expr.left),
          right: this.transformExpr(expr.right),
        };

      case "call":
        return this.transformCallExpr(expr);

      case "index":
        return {
          ...expr,
          object: this.transformExpr(expr.object),
          index: this.transformExpr(expr.index),
        };

      case "field":
        return { ...expr, object: this.transformExpr(expr.object) };

      case "lambda":
        return { ...expr, body: this.transformExpr(expr.body) };

      case "if":
        return {
          ...expr,
          condition: this.transformExpr(expr.condition),
          thenBranch: this.transformBlockExpr(expr.thenBranch),
          elseBranch: expr.elseBranch
            ? expr.elseBranch.kind === "if"
              ? (this.transformExpr(expr.elseBranch) as typeof expr.elseBranch)
              : this.transformBlockExpr(expr.elseBranch)
            : undefined,
        };

      case "match":
        return {
          ...expr,
          scrutinee: this.transformExpr(expr.scrutinee),
          arms: expr.arms.map((arm) => ({
            ...arm,
            guard: arm.guard ? this.transformExpr(arm.guard) : undefined,
            body: this.transformExpr(arm.body),
          })),
        };

      case "block":
        return this.transformBlockExpr(expr);

      case "array":
        return { ...expr, elements: expr.elements.map((e) => this.transformExpr(e)) };

      case "tuple":
        return { ...expr, elements: expr.elements.map((e) => this.transformExpr(e)) };

      case "record":
        return {
          ...expr,
          fields: expr.fields.map((f) => ({
            ...f,
            value: this.transformExpr(f.value),
          })),
        };

      case "range":
        return {
          ...expr,
          start: this.transformExpr(expr.start),
          end: this.transformExpr(expr.end),
        };

      case "propagate":
        return { ...expr, expr: this.transformExpr(expr.expr) };
    }
  }

  private transformCallExpr(expr: CallExpr): Expr {
    // Transform arguments recursively
    const transformedArgs = expr.args.map((a) => this.transformExpr(a));
    const transformedCallee = this.transformExpr(expr.callee);

    // Check if this is a call to an external function
    if (expr.callee.kind === "ident" && this.externalFunctions.has(expr.callee.name)) {
      // Wrap the call result in a validator
      const type = this.typeInfo.get(expr.callee.name);
      if (type && type.kind === "fn") {
        const returnType = type.returnType;
        const validator = this.createValidator(returnType, expr.span);

        if (validator) {
          // Create the call expression first
          const callExpr: CallExpr = {
            ...expr,
            callee: transformedCallee,
            args: transformedArgs,
          };

          // Wrap it in a validator
          const wrapped = this.wrapWithValidator(callExpr, validator, expr.span);
          this.insertions.push(expr.id);
          return wrapped;
        }
      }
    }

    return {
      ...expr,
      callee: transformedCallee,
      args: transformedArgs,
    };
  }

  private transformBlockExpr(block: BlockExpr): BlockExpr {
    return {
      ...block,
      statements: block.statements.map((s) => this.transformStmt(s)),
      expr: block.expr ? this.transformExpr(block.expr) : undefined,
    };
  }

  /**
   * Create a validator function name for a type.
   */
  private createValidator(type: Type, _span: SourceSpan): string | null {
    switch (type.kind) {
      case "con":
        switch (type.name) {
          case "Int":
          case "Int32":
          case "Int64":
            return "__validate_int";
          case "Float":
            return "__validate_float";
          case "Bool":
            return "__validate_bool";
          case "String":
            return "__validate_string";
          case "Unit":
            return null; // Unit doesn't need validation
          default:
            // Custom types may need validation
            return `__validate_${type.name.toLowerCase()}`;
        }

      case "array":
        return "__validate_array";

      case "tuple":
        return "__validate_tuple";

      case "record":
        return "__validate_record";

      case "fn":
        return "__validate_function";

      case "app":
        // Generic types like Option[T], Result[T, E]
        if (type.con.kind === "con") {
          switch (type.con.name) {
            case "Option":
              return "__validate_option";
            case "Result":
              return "__validate_result";
            default:
              return null;
          }
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Wrap an expression with a validator call.
   */
  private wrapWithValidator(expr: Expr, validator: string, span: SourceSpan): Expr {
    return {
      kind: "call",
      id: generateNodeId(),
      span,
      callee: {
        kind: "ident",
        id: generateNodeId(),
        span,
        name: validator,
      },
      args: [expr],
    };
  }
}
