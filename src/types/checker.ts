/**
 * Type Checker
 *
 * Implements bidirectional type checking with Hindley-Milner inference.
 */

import type {
  Program,
  Decl,
  Stmt,
  Expr,
  Pattern,
  FnDecl,
  LetStmt,
  BlockExpr,
  IfExpr,
  MatchExpr,
  BinaryExpr,
  UnaryExpr,
  CallExpr,
  LambdaExpr,
  LiteralExpr,
  IdentExpr,
  ArrayExpr,
  TupleExpr,
  RecordExpr,
  IndexExpr,
  FieldExpr,
  ForStmt,
  WhileStmt,
  LoopStmt,
  ReturnStmt,
  AssignStmt,
  PropagateExpr,
  RangeExpr,
  ExternalFnDecl,
  RecDecl,
  SumDecl,
  TypeAliasDecl,
  AssertStmt,
} from "../parser/ast";
import type { SourceSpan } from "../utils/span";
import type { Type, TypeScheme } from "./types";
import {
  TYPE_INT,
  TYPE_INT32,
  TYPE_INT64,
  TYPE_FLOAT,
  TYPE_BOOL,
  TYPE_STR,
  TYPE_UNIT,
  freshTypeVar,
  formatType,
  isNumericType,
  typeCon,
  typeApp,
  typeFn,
  typeTuple,
  typeArray,
  typeRecord,
} from "./types";
import { TypeContext, type VariantDef } from "./context";
import { unify, applySubst, type Substitution, emptySubst, composeSubst } from "./unify";
import { convertTypeExpr, bindTypeParams } from "./convert";
import { initializeBuiltins } from "./builtins";
import {
  DiagnosticCollector,
  ErrorCode,
  type Diagnostic,
  type Obligation,
} from "../diagnostics";
import { RefinementContext, solve } from "../refinements";
import { extractPredicate, extractTerm, substitutePredicate } from "../refinements/extract";
import type { TypeRefined } from "./types";
import { getBaseType, formatPredicate } from "./types";

// =============================================================================
// Check Result
// =============================================================================

export interface CheckResult {
  diagnostics: Diagnostic[];
  obligations: Obligation[];
  functionTypes: Map<string, Type>;
}

// =============================================================================
// Type Checker
// =============================================================================

export class TypeChecker {
  private ctx: TypeContext;
  private diagnostics: DiagnosticCollector;
  private subst: Substitution = emptySubst();
  private currentFunction: { returnType: Type; name: string; span: SourceSpan } | null = null;
  private functionTypes: Map<string, Type> = new Map();
  private refinementCtx: RefinementContext = new RefinementContext();
  private obligations: Obligation[] = [];
  private obligationCounter = 0;

  constructor() {
    this.ctx = new TypeContext();
    this.diagnostics = new DiagnosticCollector();
    initializeBuiltins(this.ctx);
  }

  /**
   * Type check an entire program.
   */
  check(program: Program): CheckResult {
    // First pass: collect type declarations
    for (const decl of program.declarations) {
      this.collectTypeDecl(decl);
    }

    // Second pass: collect function signatures
    for (const decl of program.declarations) {
      this.collectFnSignature(decl);
    }

    // Third pass: type check function bodies
    for (const decl of program.declarations) {
      if (decl.kind === "fn") {
        this.checkFnDecl(decl);
      }
    }

    return {
      diagnostics: this.diagnostics.getAll(),
      obligations: this.obligations,
      functionTypes: this.functionTypes,
    };
  }

  // ===========================================================================
  // Declaration Collection (First Pass)
  // ===========================================================================

  private collectTypeDecl(decl: Decl): void {
    switch (decl.kind) {
      case "typeAlias":
        this.collectTypeAlias(decl);
        break;
      case "rec":
        this.collectRecDecl(decl);
        break;
      case "sum":
        this.collectSumDecl(decl);
        break;
    }
  }

  private collectTypeAlias(decl: TypeAliasDecl): void {
    const typeParams = decl.typeParams.map((p) => p.name);
    const paramBindings = bindTypeParams(decl.typeParams, this.ctx);
    const type = convertTypeExpr(decl.type, this.ctx, {
      typeParams: paramBindings,
      diagnostics: this.diagnostics,
    });

    this.ctx.defineType(decl.name, {
      kind: "alias",
      name: decl.name,
      typeParams,
      type,
      span: decl.span,
    });
  }

  private collectRecDecl(decl: RecDecl): void {
    const typeParams = decl.typeParams.map((p) => p.name);
    const paramBindings = bindTypeParams(decl.typeParams, this.ctx);

    const fields = new Map<string, Type>();
    for (const field of decl.fields) {
      fields.set(
        field.name,
        convertTypeExpr(field.type, this.ctx, {
          typeParams: paramBindings,
          diagnostics: this.diagnostics,
        })
      );
    }

    this.ctx.defineType(decl.name, {
      kind: "record",
      name: decl.name,
      typeParams,
      type: typeCon(decl.name),
      fields,
      span: decl.span,
    });

    // Register the record constructor as a function
    const fieldTypes = decl.fields.map((f) =>
      convertTypeExpr(f.type, this.ctx, {
        typeParams: paramBindings,
        diagnostics: this.diagnostics,
      })
    );
    const resultType =
      typeParams.length > 0
        ? typeApp(
            typeCon(decl.name),
            typeParams.map((p) => paramBindings.get(p)!)
          )
        : typeCon(decl.name);

    this.ctx.define(decl.name, {
      type:
        typeParams.length > 0
          ? { typeParams, type: typeFn(fieldTypes, resultType) }
          : typeFn(fieldTypes, resultType),
      mutable: false,
      span: decl.span,
      source: "function",
    });
  }

  private collectSumDecl(decl: SumDecl): void {
    const typeParams = decl.typeParams.map((p) => p.name);
    const paramBindings = bindTypeParams(decl.typeParams, this.ctx);

    const variants = new Map<string, VariantDef>();
    for (const variant of decl.variants) {
      const fields: Type[] = [];
      const fieldNames: string[] = [];
      if (variant.fields) {
        for (const field of variant.fields) {
          fields.push(
            convertTypeExpr(field.type, this.ctx, {
              typeParams: paramBindings,
              diagnostics: this.diagnostics,
            })
          );
          if (field.name) {
            fieldNames.push(field.name);
          }
        }
      }
      variants.set(variant.name, {
        fields,
        fieldNames: fieldNames.length > 0 ? fieldNames : undefined,
      });
    }

    this.ctx.defineType(decl.name, {
      kind: "sum",
      name: decl.name,
      typeParams,
      type: typeCon(decl.name),
      variants,
      span: decl.span,
    });

    // Register variant constructors
    const resultType =
      typeParams.length > 0
        ? typeApp(
            typeCon(decl.name),
            typeParams.map((p) => paramBindings.get(p)!)
          )
        : typeCon(decl.name);

    for (const [variantName, variantDef] of variants) {
      const constructorType =
        variantDef.fields.length > 0
          ? typeFn(variantDef.fields, resultType)
          : resultType;

      this.ctx.define(variantName, {
        type:
          typeParams.length > 0
            ? { typeParams, type: constructorType }
            : constructorType,
        mutable: false,
        span: decl.span,
        source: "function",
      });
    }
  }

  // ===========================================================================
  // Function Signature Collection (Second Pass)
  // ===========================================================================

  private collectFnSignature(decl: Decl): void {
    if (decl.kind === "fn") {
      this.collectFnDeclSignature(decl);
    } else if (decl.kind === "externalFn") {
      this.collectExternalFnSignature(decl);
    }
  }

  private collectFnDeclSignature(decl: FnDecl): void {
    const typeParams = decl.typeParams.map((p) => p.name);
    const paramBindings = bindTypeParams(decl.typeParams, this.ctx);

    const paramTypes = decl.params.map((p) =>
      convertTypeExpr(p.type, this.ctx, {
        typeParams: paramBindings,
        diagnostics: this.diagnostics,
      })
    );
    const returnType = convertTypeExpr(decl.returnType, this.ctx, {
      typeParams: paramBindings,
      diagnostics: this.diagnostics,
    });

    const fnType = typeFn(paramTypes, returnType);

    this.ctx.define(decl.name, {
      type: typeParams.length > 0 ? { typeParams, type: fnType } : fnType,
      mutable: false,
      span: decl.span,
      source: "function",
    });

    this.functionTypes.set(decl.name, fnType);
  }

  private collectExternalFnSignature(decl: ExternalFnDecl): void {
    const typeParams = decl.typeParams.map((p) => p.name);
    const paramBindings = bindTypeParams(decl.typeParams, this.ctx);

    const paramTypes = decl.params.map((p) =>
      convertTypeExpr(p.type, this.ctx, {
        typeParams: paramBindings,
        diagnostics: this.diagnostics,
      })
    );
    const returnType = convertTypeExpr(decl.returnType, this.ctx, {
      typeParams: paramBindings,
      diagnostics: this.diagnostics,
    });

    const fnType = typeFn(paramTypes, returnType);

    this.ctx.define(decl.name, {
      type: typeParams.length > 0 ? { typeParams, type: fnType } : fnType,
      mutable: false,
      span: decl.span,
      source: "external",
    });
  }

  // ===========================================================================
  // Function Body Checking (Third Pass)
  // ===========================================================================

  private checkFnDecl(decl: FnDecl): void {
    const childCtx = this.ctx.child();
    const paramBindings = bindTypeParams(decl.typeParams, childCtx);

    // Bind type parameters
    for (const [name, type] of paramBindings) {
      childCtx.bindTypeParam(name, type);
    }

    // Push refinement scope for function body
    const parentRefCtx = this.pushRefinementScope();

    // Bind parameters and add refinement facts
    for (const param of decl.params) {
      const paramType = convertTypeExpr(param.type, childCtx, {
        typeParams: paramBindings,
        diagnostics: this.diagnostics,
      });
      childCtx.define(param.name, {
        type: paramType,
        mutable: false,
        span: param.span,
        source: "parameter",
      });

      // If parameter has a refined type, add its predicate as a fact
      if (paramType.kind === "refined") {
        // Substitute the refinement variable with the parameter name
        const predicate = substitutePredicate(
          paramType.predicate,
          paramType.varName,
          param.name
        );
        this.refinementCtx.addFact(predicate, `refinement on parameter '${param.name}'`);
      }
    }

    // Set current function context
    const returnType = convertTypeExpr(decl.returnType, childCtx, {
      typeParams: paramBindings,
      diagnostics: this.diagnostics,
    });
    this.currentFunction = { returnType, name: decl.name, span: decl.span };

    // Check body
    const bodyType = this.inferBlock(decl.body, childCtx);

    // Unify body type with declared return type
    this.unifyOrError(returnType, bodyType, decl.body.span, "Return type");

    this.currentFunction = null;

    // Pop refinement scope
    this.popRefinementScope(parentRefCtx);
  }

  // ===========================================================================
  // Expression Inference
  // ===========================================================================

  private inferExpr(expr: Expr, ctx: TypeContext): Type {
    switch (expr.kind) {
      case "literal":
        return this.inferLiteral(expr);
      case "ident":
        return this.inferIdent(expr, ctx);
      case "binary":
        return this.inferBinary(expr, ctx);
      case "unary":
        return this.inferUnary(expr, ctx);
      case "call":
        return this.inferCall(expr, ctx);
      case "lambda":
        return this.inferLambda(expr, ctx);
      case "if":
        return this.inferIf(expr, ctx);
      case "match":
        return this.inferMatch(expr, ctx);
      case "block":
        return this.inferBlock(expr, ctx);
      case "array":
        return this.inferArray(expr, ctx);
      case "tuple":
        return this.inferTuple(expr, ctx);
      case "record":
        return this.inferRecord(expr, ctx);
      case "index":
        return this.inferIndex(expr, ctx);
      case "field":
        return this.inferField(expr, ctx);
      case "propagate":
        return this.inferPropagate(expr, ctx);
      case "range":
        return this.inferRange(expr, ctx);
    }
  }

  private inferLiteral(expr: LiteralExpr): Type {
    switch (expr.value.kind) {
      case "int":
        if (expr.value.suffix === "i32") return TYPE_INT32;
        if (expr.value.suffix === "i64") return TYPE_INT64;
        return TYPE_INT;
      case "float":
        return TYPE_FLOAT;
      case "string":
      case "template":
        return TYPE_STR;
      case "bool":
        return TYPE_BOOL;
      case "unit":
        return TYPE_UNIT;
    }
  }

  private inferIdent(expr: IdentExpr, ctx: TypeContext): Type {
    const binding = ctx.lookup(expr.name);
    if (!binding) {
      this.diagnostics.error(
        ErrorCode.UnresolvedName,
        `Undefined variable '${expr.name}'`,
        expr.span,
        { kind: "unresolved_name", name: expr.name }
      );
      return freshTypeVar();
    }

    // Instantiate if it's a type scheme
    if ("typeParams" in binding.type) {
      return this.instantiate(binding.type as TypeScheme);
    }
    return binding.type as Type;
  }

  private inferBinary(expr: BinaryExpr, ctx: TypeContext): Type {
    const leftType = this.inferExpr(expr.left, ctx);
    const rightType = this.inferExpr(expr.right, ctx);

    switch (expr.op) {
      // Arithmetic operators
      case "+":
      case "-":
      case "*":
      case "%":
      case "^": {
        this.expectNumeric(leftType, expr.left.span);
        this.expectNumeric(rightType, expr.right.span);
        return this.unifyOrError(leftType, rightType, expr.span, "Arithmetic");
      }

      case "/": {
        // Division always returns Float in Axon
        this.expectNumeric(leftType, expr.left.span);
        this.expectNumeric(rightType, expr.right.span);
        return TYPE_FLOAT;
      }

      // Comparison operators
      case "==":
      case "!=":
      case "\u2260": // ≠
        this.unifyOrError(leftType, rightType, expr.span, "Comparison");
        return TYPE_BOOL;

      case "<":
      case ">":
      case "<=":
      case ">=":
      case "\u2264": // ≤
      case "\u2265": // ≥
        this.expectNumeric(leftType, expr.left.span);
        this.expectNumeric(rightType, expr.right.span);
        return TYPE_BOOL;

      // Logical operators
      case "&&":
      case "||":
      case "\u2227": // ∧
      case "\u2228": // ∨
        this.checkExpr(expr.left, TYPE_BOOL, ctx);
        this.checkExpr(expr.right, TYPE_BOOL, ctx);
        return TYPE_BOOL;

      // String concatenation
      case "++": {
        // Can concatenate strings or arrays
        const resolvedLeft = applySubst(this.subst, leftType);
        if (resolvedLeft.kind === "array") {
          this.checkExpr(expr.right, resolvedLeft, ctx);
          return resolvedLeft;
        }
        this.checkExpr(expr.left, TYPE_STR, ctx);
        this.checkExpr(expr.right, TYPE_STR, ctx);
        return TYPE_STR;
      }

      // Pipe operator
      case "|>": {
        const resolvedRight = applySubst(this.subst, rightType);
        if (resolvedRight.kind !== "fn") {
          this.diagnostics.error(
            ErrorCode.NotCallable,
            `Right side of pipe must be a function, got ${formatType(rightType)}`,
            expr.right.span,
            { kind: "not_callable" }
          );
          return freshTypeVar();
        }
        if (resolvedRight.params.length !== 1) {
          this.diagnostics.error(
            ErrorCode.ArityMismatch,
            `Piped function must take exactly one argument, takes ${resolvedRight.params.length}`,
            expr.right.span,
            { kind: "arity_mismatch" }
          );
        } else {
          this.unifyOrError(leftType, resolvedRight.params[0], expr.span, "Pipe");
        }
        return applySubst(this.subst, resolvedRight.returnType);
      }
    }

    // Unreachable but TypeScript doesn't know that
    return freshTypeVar();
  }

  private inferUnary(expr: UnaryExpr, ctx: TypeContext): Type {
    const operandType = this.inferExpr(expr.operand, ctx);

    switch (expr.op) {
      case "-":
        this.expectNumeric(operandType, expr.operand.span);
        return operandType;
      case "!":
      case "\u00AC": // ¬
        this.checkExpr(expr.operand, TYPE_BOOL, ctx);
        return TYPE_BOOL;
    }
  }

  private inferCall(expr: CallExpr, ctx: TypeContext): Type {
    const calleeType = applySubst(this.subst, this.inferExpr(expr.callee, ctx));

    if (calleeType.kind === "var") {
      // Create a function type and unify
      const paramTypes = expr.args.map(() => freshTypeVar());
      const returnType = freshTypeVar();
      const fnType = typeFn(paramTypes, returnType);
      this.unifyOrError(calleeType, fnType, expr.callee.span, "Call");

      for (let i = 0; i < expr.args.length; i++) {
        this.checkExpr(expr.args[i], paramTypes[i], ctx);
      }
      return applySubst(this.subst, returnType);
    }

    if (calleeType.kind !== "fn") {
      this.diagnostics.error(
        ErrorCode.NotCallable,
        `Expression is not callable, got ${formatType(calleeType)}`,
        expr.callee.span,
        { kind: "not_callable", actualType: formatType(calleeType) }
      );
      return freshTypeVar();
    }

    if (expr.args.length !== calleeType.params.length) {
      this.diagnostics.error(
        ErrorCode.ArityMismatch,
        `Expected ${calleeType.params.length} arguments, got ${expr.args.length}`,
        expr.span,
        {
          kind: "arity_mismatch",
          expected: String(calleeType.params.length),
          actual: String(expr.args.length),
        }
      );
    }

    // Check each argument
    const minLen = Math.min(expr.args.length, calleeType.params.length);
    for (let i = 0; i < minLen; i++) {
      this.checkExpr(expr.args[i], calleeType.params[i], ctx);
    }

    return applySubst(this.subst, calleeType.returnType);
  }

  private inferLambda(expr: LambdaExpr, ctx: TypeContext): Type {
    const childCtx = ctx.child();
    const paramTypes: Type[] = [];

    for (const param of expr.params) {
      const paramType = param.type
        ? convertTypeExpr(param.type, ctx, { diagnostics: this.diagnostics })
        : freshTypeVar(param.name);
      paramTypes.push(paramType);
      childCtx.define(param.name, {
        type: paramType,
        mutable: false,
        span: expr.span,
        source: "parameter",
      });
    }

    const bodyType = this.inferExpr(expr.body, childCtx);

    return typeFn(
      paramTypes.map((t) => applySubst(this.subst, t)),
      applySubst(this.subst, bodyType)
    );
  }

  private inferIf(expr: IfExpr, ctx: TypeContext): Type {
    this.checkExpr(expr.condition, TYPE_BOOL, ctx);

    // Extract condition predicate for refinement tracking
    const conditionPredicate = extractPredicate(expr.condition);

    // Check then branch with condition as fact
    let thenType: Type;
    {
      const parentRefCtx = this.pushRefinementScope();
      if (conditionPredicate.kind !== "unknown") {
        this.refinementCtx.addFact(conditionPredicate, "if condition (then)");
      }
      thenType = this.inferBlock(expr.thenBranch, ctx);
      this.popRefinementScope(parentRefCtx);
    }

    if (expr.elseBranch) {
      // Check else branch with negated condition as fact
      let elseType: Type;
      {
        const parentRefCtx = this.pushRefinementScope();
        if (conditionPredicate.kind !== "unknown") {
          this.refinementCtx.addFact(
            { kind: "not", inner: conditionPredicate },
            "if condition (else)"
          );
        }
        elseType =
          expr.elseBranch.kind === "if"
            ? this.inferIf(expr.elseBranch, ctx)
            : this.inferBlock(expr.elseBranch, ctx);
        this.popRefinementScope(parentRefCtx);
      }

      return this.unifyOrError(thenType, elseType, expr.span, "If branches");
    } else {
      // If without else must have Unit type
      this.unifyOrError(thenType, TYPE_UNIT, expr.span, "If without else");
      return TYPE_UNIT;
    }
  }

  private inferMatch(expr: MatchExpr, ctx: TypeContext): Type {
    const scrutineeType = this.inferExpr(expr.scrutinee, ctx);

    if (expr.arms.length === 0) {
      this.diagnostics.error(
        ErrorCode.NonExhaustiveMatch,
        `Match expression must have at least one arm`,
        expr.span,
        { kind: "non_exhaustive_match" }
      );
      return freshTypeVar();
    }

    let resultType: Type | null = null;

    for (const arm of expr.arms) {
      const armCtx = ctx.child();
      this.checkPattern(arm.pattern, scrutineeType, armCtx);

      if (arm.guard) {
        this.checkExpr(arm.guard, TYPE_BOOL, armCtx);
      }

      const armType = this.inferExpr(arm.body, armCtx);

      if (resultType === null) {
        resultType = armType;
      } else {
        resultType = this.unifyOrError(resultType, armType, arm.span, "Match arms");
      }
    }

    return resultType ?? freshTypeVar();
  }

  private inferBlock(block: BlockExpr, ctx: TypeContext): Type {
    const blockCtx = ctx.child();

    for (const stmt of block.statements) {
      this.checkStmt(stmt, blockCtx);
    }

    if (block.expr) {
      return this.inferExpr(block.expr, blockCtx);
    }

    return TYPE_UNIT;
  }

  private inferArray(expr: ArrayExpr, ctx: TypeContext): Type {
    if (expr.elements.length === 0) {
      return typeArray(freshTypeVar());
    }

    let elemType = this.inferExpr(expr.elements[0], ctx);
    for (let i = 1; i < expr.elements.length; i++) {
      const t = this.inferExpr(expr.elements[i], ctx);
      elemType = this.unifyOrError(elemType, t, expr.elements[i].span, "Array elements");
    }

    return typeArray(applySubst(this.subst, elemType));
  }

  private inferTuple(expr: TupleExpr, ctx: TypeContext): Type {
    const elements = expr.elements.map((e) => this.inferExpr(e, ctx));
    return typeTuple(elements);
  }

  private inferRecord(expr: RecordExpr, ctx: TypeContext): Type {
    const fields = new Map<string, Type>();
    for (const field of expr.fields) {
      fields.set(field.name, this.inferExpr(field.value, ctx));
    }
    return typeRecord(fields, false);
  }

  private inferIndex(expr: IndexExpr, ctx: TypeContext): Type {
    const objType = applySubst(this.subst, this.inferExpr(expr.object, ctx));
    const indexType = this.inferExpr(expr.index, ctx);

    // Unwrap refinements to check the base type
    const baseObjType = getBaseType(this.expandAlias(objType, ctx));

    if (baseObjType.kind === "array") {
      this.expectInteger(indexType, expr.index.span);
      return baseObjType.element;
    }

    if (baseObjType.kind === "tuple") {
      // For tuple indexing, we need a literal integer
      this.expectInteger(indexType, expr.index.span);
      // Can't statically determine index, return a type variable
      return freshTypeVar();
    }

    if (baseObjType.kind === "var") {
      // Constrain to array type
      const elemType = freshTypeVar();
      this.unifyOrError(baseObjType, typeArray(elemType), expr.object.span, "Index");
      this.expectInteger(indexType, expr.index.span);
      return elemType;
    }

    this.diagnostics.error(
      ErrorCode.NotIndexable,
      `Type ${formatType(objType)} is not indexable`,
      expr.object.span,
      { kind: "not_indexable" }
    );
    return freshTypeVar();
  }

  private inferField(expr: FieldExpr, ctx: TypeContext): Type {
    const objType = applySubst(this.subst, this.inferExpr(expr.object, ctx));

    if (objType.kind === "record") {
      const fieldType = objType.fields.get(expr.field);
      if (!fieldType) {
        this.diagnostics.error(
          ErrorCode.UnknownField,
          `Unknown field '${expr.field}'`,
          expr.span,
          { kind: "unknown_field", field: expr.field }
        );
        return freshTypeVar();
      }
      return fieldType;
    }

    // Check for named record types
    if (objType.kind === "con" || objType.kind === "app") {
      const typeName = objType.kind === "con" ? objType.name :
        (objType.con.kind === "con" ? objType.con.name : null);
      if (typeName) {
        const typeDef = ctx.lookupType(typeName);
        if (typeDef?.kind === "record" && typeDef.fields) {
          const fieldType = typeDef.fields.get(expr.field);
          if (fieldType) {
            return fieldType;
          }
          this.diagnostics.error(
            ErrorCode.UnknownField,
            `Unknown field '${expr.field}' on type '${typeName}'`,
            expr.span,
            { kind: "unknown_field", field: expr.field, type: typeName }
          );
          return freshTypeVar();
        }
      }
    }

    if (objType.kind === "var") {
      // Can't determine field access on unknown type
      return freshTypeVar();
    }

    this.diagnostics.error(
      ErrorCode.NotARecord,
      `Type ${formatType(objType)} has no fields`,
      expr.object.span,
      { kind: "not_a_record" }
    );
    return freshTypeVar();
  }

  private inferPropagate(expr: PropagateExpr, ctx: TypeContext): Type {
    const innerType = applySubst(this.subst, this.inferExpr(expr.expr, ctx));

    // ? operator expects Option[T] or Result[T, E]
    if (innerType.kind === "app" && innerType.con.kind === "con") {
      if (innerType.con.name === "Option" && innerType.args.length === 1) {
        return innerType.args[0];
      }
      if (innerType.con.name === "Result" && innerType.args.length === 2) {
        return innerType.args[0];
      }
    }

    this.diagnostics.error(
      ErrorCode.InvalidPropagate,
      `Cannot use ? on type ${formatType(innerType)}; expected Option or Result`,
      expr.span,
      { kind: "invalid_propagate" }
    );
    return freshTypeVar();
  }

  private inferRange(expr: RangeExpr, ctx: TypeContext): Type {
    this.checkExpr(expr.start, TYPE_INT, ctx);
    this.checkExpr(expr.end, TYPE_INT, ctx);
    return typeArray(TYPE_INT);
  }

  // ===========================================================================
  // Expression Checking
  // ===========================================================================

  private checkExpr(expr: Expr, expected: Type, ctx: TypeContext): void {
    const actual = this.inferExpr(expr, ctx);
    const resolvedExpected = this.expandAlias(applySubst(this.subst, expected), ctx);

    // If the expected type is refined, handle refinement checking with the expression
    if (resolvedExpected.kind === "refined") {
      // Unify base types
      this.unifyOrError(resolvedExpected.base, actual, expr.span, "Expression");

      // Check refinement with the argument expression substituted
      const argTerm = extractTerm(expr);
      const substitutedPredicate = substitutePredicate(
        resolvedExpected.predicate,
        resolvedExpected.varName,
        "__arg__"
      );
      // Replace __arg__ with the actual term by setting it as a definition
      const childCtx = this.refinementCtx.child();
      childCtx.setDefinition("__arg__", argTerm);
      this.checkRefinementWithContext(resolvedExpected, substitutedPredicate, childCtx, expr.span, "Argument");
    } else {
      this.unifyOrError(expected, actual, expr.span, "Expression");
    }
  }

  /**
   * Check refinement with a specific context.
   */
  private checkRefinementWithContext(
    expected: TypeRefined,
    predicate: import("./types").RefinementPredicate,
    ctx: RefinementContext,
    span: SourceSpan,
    context: string
  ): void {
    const solverResult = solve(predicate, ctx);

    switch (solverResult.status) {
      case "discharged":
        // Predicate is satisfied - nothing to do
        break;

      case "refuted":
        // Predicate is definitely false - error
        this.diagnostics.error(
          ErrorCode.UnprovableRefinement,
          `${context}: refinement ${formatPredicate(predicate)} cannot be satisfied`,
          span,
          {
            kind: "refinement_violation",
            predicate: formatPredicate(predicate),
            counterexample: solverResult.counterexample,
          }
        );
        break;

      case "unknown":
        // Cannot prove - generate proof obligation
        this.obligations.push({
          kind: "refinement",
          goal: formatPredicate(predicate),
          location: span,
          context: {
            facts: ctx.getAllFacts().map((f) => ({
              proposition: formatPredicate(f.predicate),
              source: f.source,
            })),
            bindings: [],
          },
          hints: [],
          solver: {
            reason: solverResult.reason,
          },
        });
        break;
    }
  }

  // ===========================================================================
  // Statement Checking
  // ===========================================================================

  private checkStmt(stmt: Stmt, ctx: TypeContext): void {
    switch (stmt.kind) {
      case "let":
        return this.checkLet(stmt, ctx);
      case "assign":
        return this.checkAssign(stmt, ctx);
      case "expr":
        this.inferExpr(stmt.expr, ctx);
        return;
      case "for":
        return this.checkFor(stmt, ctx);
      case "while":
        return this.checkWhile(stmt, ctx);
      case "loop":
        return this.checkLoop(stmt, ctx);
      case "return":
        return this.checkReturn(stmt, ctx);
      case "break":
      case "continue":
        return;
      case "assert":
        return this.checkAssert(stmt, ctx);
    }
  }

  private checkLet(stmt: LetStmt, ctx: TypeContext): void {
    let expectedType: Type | undefined;
    if (stmt.type) {
      expectedType = convertTypeExpr(stmt.type, ctx, {
        diagnostics: this.diagnostics,
      });
    }

    const initType = this.inferExpr(stmt.init, ctx);

    if (expectedType) {
      this.unifyOrError(expectedType, initType, stmt.span, "Let binding");
    }

    const finalType = applySubst(this.subst, expectedType ?? initType);
    this.bindPattern(stmt.pattern, finalType, stmt.mutable, ctx);

    // Track variable definition for arithmetic reasoning
    // Only for simple identifier patterns (not tuples, records, etc.)
    if (stmt.pattern.kind === "ident" && !stmt.mutable) {
      const term = extractTerm(stmt.init);
      this.refinementCtx.setDefinition(stmt.pattern.name, term);
    }
  }

  private checkAssign(stmt: AssignStmt, ctx: TypeContext): void {
    const targetType = this.inferExpr(stmt.target, ctx);
    this.checkExpr(stmt.value, targetType, ctx);

    // Check mutability
    if (stmt.target.kind === "ident") {
      const binding = ctx.lookup(stmt.target.name);
      if (binding && !binding.mutable) {
        this.diagnostics.error(
          ErrorCode.ImmutableAssign,
          `Cannot assign to immutable variable '${stmt.target.name}'`,
          stmt.span,
          { kind: "immutable_assign", name: stmt.target.name },
          [
            {
              strategy: "add_mut",
              description: "Add 'mut' to the variable declaration",
              confidence: "high",
            },
          ],
          [{ message: "Variable declared here", location: binding.span }]
        );
      }
    }
  }

  private checkFor(stmt: ForStmt, ctx: TypeContext): void {
    const iterableType = applySubst(this.subst, this.inferExpr(stmt.iterable, ctx));

    let elementType: Type;
    if (iterableType.kind === "array") {
      elementType = iterableType.element;
    } else if (iterableType.kind === "var") {
      elementType = freshTypeVar();
      this.unifyOrError(iterableType, typeArray(elementType), stmt.iterable.span, "For loop");
    } else {
      this.diagnostics.error(
        ErrorCode.NotIterable,
        `Type ${formatType(iterableType)} is not iterable`,
        stmt.iterable.span,
        { kind: "not_iterable" }
      );
      elementType = freshTypeVar();
    }

    const bodyCtx = ctx.child();
    this.bindPattern(stmt.pattern, elementType, false, bodyCtx);
    this.inferBlock(stmt.body, bodyCtx);
  }

  private checkWhile(stmt: WhileStmt, ctx: TypeContext): void {
    this.checkExpr(stmt.condition, TYPE_BOOL, ctx);
    this.inferBlock(stmt.body, ctx);
  }

  private checkLoop(stmt: LoopStmt, ctx: TypeContext): void {
    this.inferBlock(stmt.body, ctx);
  }

  private checkReturn(stmt: ReturnStmt, ctx: TypeContext): void {
    if (!this.currentFunction) {
      this.diagnostics.error(
        ErrorCode.ReturnOutsideFunction,
        `Return statement outside of function`,
        stmt.span,
        { kind: "return_outside_function" }
      );
      return;
    }

    if (stmt.value) {
      this.checkExpr(stmt.value, this.currentFunction.returnType, ctx);
    } else {
      this.unifyOrError(
        this.currentFunction.returnType,
        TYPE_UNIT,
        stmt.span,
        "Return"
      );
    }
  }

  private checkAssert(stmt: AssertStmt, ctx: TypeContext): void {
    this.checkExpr(stmt.condition, TYPE_BOOL, ctx);
  }

  // ===========================================================================
  // Pattern Handling
  // ===========================================================================

  private bindPattern(
    pattern: Pattern,
    type: Type,
    mutable: boolean,
    ctx: TypeContext
  ): void {
    const resolvedType = applySubst(this.subst, type);

    switch (pattern.kind) {
      case "ident":
        ctx.define(pattern.name, {
          type: resolvedType,
          mutable,
          span: pattern.span,
          source: "let",
        });
        break;

      case "tuple":
        if (resolvedType.kind !== "tuple") {
          if (resolvedType.kind === "var") {
            // Create tuple type
            const elemTypes = pattern.elements.map(() => freshTypeVar());
            this.unifyOrError(resolvedType, typeTuple(elemTypes), pattern.span, "Tuple pattern");
            for (let i = 0; i < pattern.elements.length; i++) {
              this.bindPattern(pattern.elements[i], elemTypes[i], mutable, ctx);
            }
            return;
          }
          this.diagnostics.error(
            ErrorCode.PatternMismatch,
            `Cannot destructure ${formatType(resolvedType)} with tuple pattern`,
            pattern.span,
            { kind: "pattern_mismatch" }
          );
          return;
        }
        if (resolvedType.elements.length !== pattern.elements.length) {
          this.diagnostics.error(
            ErrorCode.PatternMismatch,
            `Tuple pattern has ${pattern.elements.length} elements, but type has ${resolvedType.elements.length}`,
            pattern.span,
            { kind: "pattern_mismatch" }
          );
          return;
        }
        for (let i = 0; i < pattern.elements.length; i++) {
          this.bindPattern(pattern.elements[i], resolvedType.elements[i], mutable, ctx);
        }
        break;

      case "record":
        if (resolvedType.kind !== "record") {
          this.diagnostics.error(
            ErrorCode.PatternMismatch,
            `Cannot destructure ${formatType(resolvedType)} with record pattern`,
            pattern.span,
            { kind: "pattern_mismatch" }
          );
          return;
        }
        for (const field of pattern.fields) {
          const fieldType = resolvedType.fields.get(field.name);
          if (!fieldType) {
            this.diagnostics.error(
              ErrorCode.UnknownField,
              `Unknown field '${field.name}'`,
              pattern.span,
              { kind: "unknown_field", field: field.name }
            );
            continue;
          }
          if (field.pattern) {
            this.bindPattern(field.pattern, fieldType, mutable, ctx);
          } else {
            ctx.define(field.name, {
              type: fieldType,
              mutable,
              span: pattern.span,
              source: "let",
            });
          }
        }
        break;

      case "wildcard":
        // Discard
        break;

      case "literal":
        // Literal patterns just check for equality, no bindings
        break;

      case "variant": {
        // Variant patterns need to bind payload variables
        // Look up the sum type to find the variant definition
        const expanded = this.expandAlias(resolvedType, ctx);
        if (expanded.kind === "con") {
          const typeDef = ctx.lookupType(expanded.name);
          if (typeDef?.kind === "sum" && typeDef.variants) {
            const variantDef = typeDef.variants.get(pattern.name);
            if (variantDef && pattern.payload) {
              // Bind each payload pattern to the corresponding field type
              for (let i = 0; i < pattern.payload.length && i < variantDef.fields.length; i++) {
                this.bindPattern(pattern.payload[i], variantDef.fields[i], mutable, ctx);
              }
            }
          }
        }
        break;
      }
    }
  }

  private checkPattern(pattern: Pattern, type: Type, ctx: TypeContext): void {
    // For match patterns, we need to check compatibility and bind variables
    this.bindPattern(pattern, type, false, ctx);
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private instantiate(scheme: TypeScheme): Type {
    const subst = new Map<string, Type>();
    for (const param of scheme.typeParams) {
      subst.set(param, freshTypeVar(param));
    }
    return this.substituteNamed(scheme.type, subst);
  }

  private substituteNamed(type: Type, subst: Map<string, Type>): Type {
    switch (type.kind) {
      case "var":
        if (type.name && subst.has(type.name)) {
          return subst.get(type.name)!;
        }
        return type;
      case "con":
      case "never":
        return type;
      case "app":
        return typeApp(
          this.substituteNamed(type.con, subst),
          type.args.map((a) => this.substituteNamed(a, subst))
        );
      case "fn":
        return typeFn(
          type.params.map((p) => this.substituteNamed(p, subst)),
          this.substituteNamed(type.returnType, subst)
        );
      case "tuple":
        return typeTuple(type.elements.map((e) => this.substituteNamed(e, subst)));
      case "array":
        return typeArray(this.substituteNamed(type.element, subst));
      case "record": {
        const fields = new Map<string, Type>();
        for (const [k, v] of type.fields) {
          fields.set(k, this.substituteNamed(v, subst));
        }
        return typeRecord(fields, type.isOpen);
      }
      default:
        // For refined, effect, and other types, return unchanged
        return type;
    }
  }

  /**
   * Expand type aliases recursively.
   * For example: type MyInt = Int; MyInt expands to Int.
   */
  private expandAlias(type: Type, ctx: TypeContext): Type {
    if (type.kind === "con") {
      const def = ctx.lookupType(type.name);
      if (def?.kind === "alias") {
        // Recursively expand in case of nested aliases
        return this.expandAlias(def.type, ctx);
      }
    } else if (type.kind === "app") {
      // Also expand applied types like MyList[Int]
      const expanded = this.expandAlias(type.con, ctx);
      return {
        kind: "app",
        con: expanded,
        args: type.args.map((a) => this.expandAlias(a, ctx)),
      };
    } else if (type.kind === "fn") {
      return {
        kind: "fn",
        params: type.params.map((p) => this.expandAlias(p, ctx)),
        returnType: this.expandAlias(type.returnType, ctx),
      };
    } else if (type.kind === "tuple") {
      return {
        kind: "tuple",
        elements: type.elements.map((e) => this.expandAlias(e, ctx)),
      };
    } else if (type.kind === "array") {
      return {
        kind: "array",
        element: this.expandAlias(type.element, ctx),
      };
    } else if (type.kind === "record") {
      const fields = new Map<string, Type>();
      for (const [k, v] of type.fields) {
        fields.set(k, this.expandAlias(v, ctx));
      }
      return { ...type, fields };
    }
    return type;
  }

  private expectNumeric(type: Type, span: SourceSpan): void {
    const resolved = applySubst(this.subst, type);
    if (resolved.kind === "var") return; // Will be constrained later
    const expanded = this.expandAlias(resolved, this.ctx);
    if (!isNumericType(expanded)) {
      this.diagnostics.error(
        ErrorCode.InvalidOperandType,
        `Expected numeric type, got ${formatType(type)}`,
        span,
        { kind: "type_mismatch", expected: "numeric", actual: formatType(type) }
      );
    }
  }

  private expectInteger(type: Type, span: SourceSpan): void {
    const resolved = applySubst(this.subst, type);
    if (resolved.kind === "var") return;
    const expanded = this.expandAlias(resolved, this.ctx);
    if (expanded.kind !== "con" || !["Int", "Int32", "Int64", "Nat"].includes(expanded.name)) {
      this.diagnostics.error(
        ErrorCode.InvalidOperandType,
        `Expected integer type, got ${formatType(type)}`,
        span,
        { kind: "type_mismatch", expected: "integer", actual: formatType(type) }
      );
    }
  }

  private unifyOrError(t1: Type, t2: Type, span: SourceSpan, context: string): Type {
    const resolved1 = this.expandAlias(applySubst(this.subst, t1), this.ctx);
    const resolved2 = this.expandAlias(applySubst(this.subst, t2), this.ctx);
    const result = unify(resolved1, resolved2);

    if (!result.ok) {
      this.diagnostics.error(
        ErrorCode.TypeMismatch,
        `${context}: ${result.error.message}`,
        span,
        {
          kind: result.error.kind,
          expected: formatType(t1),
          actual: formatType(t2),
        }
      );
      return t1;
    }

    this.subst = composeSubst(result.subst, this.subst);

    // Check for refinement type constraints
    // If t1 is refined (expected type), we need to prove the predicate holds
    if (resolved1.kind === "refined") {
      this.checkRefinement(resolved1, resolved2, span, context);
    }

    return applySubst(this.subst, t1);
  }

  // ===========================================================================
  // Refinement Checking
  // ===========================================================================

  /**
   * Check that a value satisfies a refinement predicate.
   * If we can't prove it, generate a proof obligation.
   */
  private checkRefinement(
    expected: TypeRefined,
    _actual: Type,
    span: SourceSpan,
    context: string
  ): void {
    const { predicate } = expected;

    // Try to solve the predicate with current facts
    const solverResult = solve(predicate, this.refinementCtx);

    switch (solverResult.status) {
      case "discharged":
        // Predicate is satisfied - nothing to do
        break;

      case "refuted":
        // Predicate is definitely false - error
        this.diagnostics.error(
          ErrorCode.UnprovableRefinement,
          `${context}: refinement ${formatPredicate(predicate)} cannot be satisfied`,
          span,
          {
            kind: "refinement_violation",
            predicate: formatPredicate(predicate),
            counterexample: solverResult.counterexample,
          }
        );
        break;

      case "unknown":
        // Can't prove or refute - generate an obligation
        this.addObligation(
          "refinement",
          formatPredicate(predicate),
          span,
          solverResult.reason
        );
        break;
    }
  }

  /**
   * Add a proof obligation that must be verified.
   */
  private addObligation(
    kind: "refinement" | "precondition" | "postcondition",
    goal: string,
    location: SourceSpan,
    reason?: string
  ): void {
    const id = `OBL${++this.obligationCounter}`;

    // Collect context information
    const bindings = this.collectBindingsForObligation();
    const facts = this.collectFactsForObligation();

    const obligation: Obligation = {
      id,
      kind,
      goal,
      location,
      context: { bindings, facts },
      hints: reason ? [{ strategy: "manual", description: reason, confidence: "low" }] : [],
      solverAttempted: true,
      solverResult: "unknown",
    };

    this.obligations.push(obligation);
  }

  /**
   * Collect variable bindings for obligation context.
   */
  private collectBindingsForObligation(): Array<{
    name: string;
    type: string;
    mutable: boolean;
    source: string;
  }> {
    // This is a simplified version - in a full implementation,
    // we would track all in-scope variables
    return [];
  }

  /**
   * Collect known facts for obligation context.
   */
  private collectFactsForObligation(): Array<{
    proposition: string;
    source: string;
  }> {
    return this.refinementCtx.getAllFacts().map((f) => ({
      proposition: formatPredicate(f.predicate),
      source: f.source,
    }));
  }

  /**
   * Add a fact from a conditional expression.
   * Call this when entering an if-then branch to track the condition as a fact.
   */
  // @ts-ignore - Defined for future use
  private _addFactFromCondition(condition: Expr, source: string): void {
    const predicate = extractPredicate(condition);
    if (predicate.kind !== "unknown") {
      this.refinementCtx.addFact(predicate, source);
    }
  }

  /**
   * Create a child refinement context for a new scope.
   */
  private pushRefinementScope(): RefinementContext {
    const parent = this.refinementCtx;
    this.refinementCtx = this.refinementCtx.child();
    return parent;
  }

  /**
   * Restore the previous refinement context.
   */
  private popRefinementScope(parent: RefinementContext): void {
    this.refinementCtx = parent;
  }
}

// =============================================================================
// Public API
// =============================================================================

export function typecheck(program: Program): CheckResult {
  const checker = new TypeChecker();
  return checker.check(program);
}
