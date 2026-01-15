/**
 * JavaScript Code Emitter
 *
 * Generates JavaScript code from a type-checked Axon AST.
 */

import type {
  Program,
  Stmt,
  Expr,
  Pattern,
  BlockExpr,
  FnDecl,
  RecDecl,
  SumDecl,
  ExternalFnDecl,
  ExternalModDecl,
  BinaryOp,
  IfExpr,
} from "../parser/ast";
import { getRuntimeCode, getMinimalRuntimeCode } from "./runtime";

// =============================================================================
// Emit Options
// =============================================================================

export interface EmitOptions {
  /** Include runtime helpers in output */
  includeRuntime?: boolean | undefined;
  /** Use minimal runtime (smaller output) */
  minimalRuntime?: boolean | undefined;
  /** Add source map comment */
  sourceMap?: boolean | undefined;
  /** Indent string (default: 2 spaces) */
  indent?: string | undefined;
}

interface ResolvedEmitOptions {
  includeRuntime: boolean;
  minimalRuntime: boolean;
  sourceMap: boolean;
  indent: string;
}

// =============================================================================
// Emit Result
// =============================================================================

export interface EmitResult {
  code: string;
  sourceMap?: string | undefined;
}

// =============================================================================
// Code Emitter
// =============================================================================

export class CodeEmitter {
  private output: string[] = [];
  private indentLevel = 0;
  private options: ResolvedEmitOptions;

  constructor(options: EmitOptions = {}) {
    this.options = {
      includeRuntime: options.includeRuntime ?? true,
      minimalRuntime: options.minimalRuntime ?? false,
      sourceMap: options.sourceMap ?? false,
      indent: options.indent ?? "  ",
    };
  }

  /**
   * Emit JavaScript code from a program.
   */
  emit(program: Program): EmitResult {
    this.output = [];
    this.indentLevel = 0;

    // Emit runtime if requested
    if (this.options.includeRuntime) {
      const runtime = this.options.minimalRuntime
        ? getMinimalRuntimeCode()
        : getRuntimeCode();
      this.output.push(runtime);
      this.output.push("");
    }

    // Emit external module imports
    for (const decl of program.declarations) {
      if (decl.kind === "externalMod") {
        this.emitExternalMod(decl);
      }
    }

    // Emit type declarations (record/sum constructors)
    for (const decl of program.declarations) {
      if (decl.kind === "rec") {
        this.emitRecDecl(decl);
      } else if (decl.kind === "sum") {
        this.emitSumDecl(decl);
      }
    }

    // Emit function declarations
    for (const decl of program.declarations) {
      if (decl.kind === "fn") {
        this.emitFnDecl(decl);
      } else if (decl.kind === "externalFn") {
        this.emitExternalFn(decl);
      }
    }

    return { code: this.output.join("\n") };
  }

  // ===========================================================================
  // Declaration Emission
  // ===========================================================================

  private emitExternalMod(decl: ExternalModDecl): void {
    this.line(`import * as ${decl.name} from "${decl.jsModule}";`);
  }

  private emitRecDecl(decl: RecDecl): void {
    const fields = decl.fields.map((f) => f.name);
    const params = fields.join(", ");
    this.line(`function ${decl.name}(${params}) {`);
    this.indentLevel++;
    this.line(`return { ${params} };`);
    this.indentLevel--;
    this.line(`}`);
    this.line(``);
  }

  private emitSumDecl(decl: SumDecl): void {
    for (const variant of decl.variants) {
      if (variant.fields && variant.fields.length > 0) {
        const params = variant.fields
          .map((f, i) => f.name ?? `_${i}`)
          .join(", ");
        this.line(`function ${variant.name}(${params}) {`);
        this.indentLevel++;
        this.line(`return { tag: "${variant.name}", ${params} };`);
        this.indentLevel--;
        this.line(`}`);
      } else {
        this.line(
          `const ${variant.name} = Object.freeze({ tag: "${variant.name}" });`
        );
      }
    }
    this.line(``);
  }

  private emitFnDecl(decl: FnDecl): void {
    const params = decl.params.map((p) => p.name).join(", ");
    this.line(`function ${decl.name}(${params}) {`);
    this.indentLevel++;
    this.emitBlock(decl.body, true);
    this.indentLevel--;
    this.line(`}`);
    this.line(``);
  }

  private emitExternalFn(decl: ExternalFnDecl): void {
    const params = decl.params.map((p) => p.name).join(", ");
    this.line(`function ${decl.name}(${params}) {`);
    this.indentLevel++;
    this.line(`return ${decl.jsName}(${params});`);
    this.indentLevel--;
    this.line(`}`);
    this.line(``);
  }

  // ===========================================================================
  // Block Emission
  // ===========================================================================

  private emitBlock(block: BlockExpr, isReturn: boolean): void {
    for (const stmt of block.statements) {
      this.emitStmt(stmt);
    }
    if (block.expr) {
      if (isReturn) {
        this.line(`return ${this.emitExpr(block.expr)};`);
      } else {
        this.line(`${this.emitExpr(block.expr)};`);
      }
    }
  }

  // ===========================================================================
  // Statement Emission
  // ===========================================================================

  private emitStmt(stmt: Stmt): void {
    switch (stmt.kind) {
      case "let": {
        const pattern = this.emitPattern(stmt.pattern);
        const keyword = stmt.mutable ? "let" : "const";
        this.line(`${keyword} ${pattern} = ${this.emitExpr(stmt.init)};`);
        break;
      }

      case "assign":
        this.line(
          `${this.emitExpr(stmt.target)} = ${this.emitExpr(stmt.value)};`
        );
        break;

      case "expr":
        this.line(`${this.emitExpr(stmt.expr)};`);
        break;

      case "for": {
        const pattern = this.emitPattern(stmt.pattern);
        const iterable = this.emitExpr(stmt.iterable);
        this.line(`for (const ${pattern} of ${iterable}) {`);
        this.indentLevel++;
        this.emitBlock(stmt.body, false);
        this.indentLevel--;
        this.line(`}`);
        break;
      }

      case "while":
        this.line(`while (${this.emitExpr(stmt.condition)}) {`);
        this.indentLevel++;
        this.emitBlock(stmt.body, false);
        this.indentLevel--;
        this.line(`}`);
        break;

      case "loop":
        this.line(`while (true) {`);
        this.indentLevel++;
        this.emitBlock(stmt.body, false);
        this.indentLevel--;
        this.line(`}`);
        break;

      case "return":
        if (stmt.value) {
          this.line(`return ${this.emitExpr(stmt.value)};`);
        } else {
          this.line(`return;`);
        }
        break;

      case "break":
        this.line(`break;`);
        break;

      case "continue":
        this.line(`continue;`);
        break;

      case "assert": {
        const msg = stmt.message ? `, "${stmt.message}"` : "";
        this.line(`__axon.assert(${this.emitExpr(stmt.condition)}${msg});`);
        break;
      }
    }
  }

  // ===========================================================================
  // Expression Emission
  // ===========================================================================

  private emitExpr(expr: Expr): string {
    switch (expr.kind) {
      case "literal":
        return this.emitLiteral(expr);

      case "ident":
        return this.emitIdent(expr.name);

      case "binary":
        return this.emitBinary(expr);

      case "unary":
        return this.emitUnary(expr);

      case "call": {
        const callee = this.emitExpr(expr.callee);
        const args = expr.args.map((a) => this.emitExpr(a)).join(", ");
        return `${callee}(${args})`;
      }

      case "index":
        return `${this.emitExpr(expr.object)}[${this.emitExpr(expr.index)}]`;

      case "field":
        return `${this.emitExpr(expr.object)}.${expr.field}`;

      case "lambda": {
        const params = expr.params.map((p) => p.name).join(", ");
        const body = this.emitExpr(expr.body);
        return `((${params}) => ${body})`;
      }

      case "if":
        return this.emitIf(expr);

      case "match":
        return this.emitMatch(expr);

      case "block":
        return this.emitBlockExpr(expr);

      case "array": {
        const elements = expr.elements.map((e) => this.emitExpr(e)).join(", ");
        return `[${elements}]`;
      }

      case "tuple": {
        // Tuples become arrays in JS
        const elements = expr.elements.map((e) => this.emitExpr(e)).join(", ");
        return `[${elements}]`;
      }

      case "record": {
        const fields = expr.fields
          .map((f) => `${f.name}: ${this.emitExpr(f.value)}`)
          .join(", ");
        return `{ ${fields} }`;
      }

      case "range": {
        const start = this.emitExpr(expr.start);
        const end = this.emitExpr(expr.end);
        const inclusive = expr.inclusive ? "true" : "false";
        return `__axon.range(${start}, ${end}, ${inclusive})`;
      }

      case "propagate":
        // The ? operator - needs IIFE for early return semantics
        // In a real implementation, this would need function context tracking
        return this.emitPropagate(expr);
    }
  }

  private emitLiteral(expr: { value: any }): string {
    const val = expr.value;
    switch (val.kind) {
      case "int":
        // Use BigInt for Int, number for Int32
        if (val.suffix === "i32") {
          return `${val.value}`;
        }
        return `${val.value}n`;

      case "float":
        return `${val.value}`;

      case "string":
        return JSON.stringify(val.value);

      case "template":
        // Template strings - emit as template literal
        return `\`${val.value}\``;

      case "bool":
        return val.value ? "true" : "false";

      case "unit":
        return "undefined";

      default:
        return "undefined";
    }
  }

  private emitBinary(expr: { op: BinaryOp; left: Expr; right: Expr }): string {
    const left = this.emitExpr(expr.left);
    const right = this.emitExpr(expr.right);

    // Map Axon operators to JS
    const opMap: Record<string, string> = {
      "+": "+",
      "-": "-",
      "*": "*",
      "/": "/",
      "%": "%",
      "^": "**",
      "==": "===",
      "!=": "!==",
      "\u2260": "!==", // ≠
      "<": "<",
      ">": ">",
      "<=": "<=",
      ">=": ">=",
      "\u2264": "<=", // ≤
      "\u2265": ">=", // ≥
      "&&": "&&",
      "||": "||",
      "\u2227": "&&", // ∧
      "\u2228": "||", // ∨
      "++": "+", // String/array concat is + in JS
    };

    if (expr.op === "|>") {
      // Pipe: x |> f becomes f(x)
      return `${right}(${left})`;
    }

    const jsOp = opMap[expr.op] ?? expr.op;
    return `(${left} ${jsOp} ${right})`;
  }

  private emitUnary(expr: { op: string; operand: Expr }): string {
    const operand = this.emitExpr(expr.operand);
    const opMap: Record<string, string> = {
      "-": "-",
      "!": "!",
      "\u00AC": "!", // ¬
    };
    return `${opMap[expr.op] ?? expr.op}${operand}`;
  }

  /**
   * Emit an identifier, prefixing built-in runtime functions with __axon.
   */
  private emitIdent(name: string): string {
    // Built-in runtime functions that need __axon. prefix
    const runtimeFunctions = new Set([
      // Option/Result constructors
      "Some", "None", "Ok", "Err",
      // Ordering values
      "Less", "Equal", "Greater",
      // Pattern matching
      "match",
      // Control flow
      "assert", "panic", "unreachable",
      // Range
      "range",
      // Array helpers
      "len", "is_empty", "push", "map", "filter", "fold",
      // String helpers
      "str_len", "trim", "split", "join", "to_string",
      // IO helpers
      "print", "println",
      // Math helpers
      "abs", "min", "max",
      // Type conversion
      "int_to_float", "float_to_int",
    ]);

    if (runtimeFunctions.has(name)) {
      return `__axon.${name}`;
    }
    return name;
  }

  private emitIf(expr: IfExpr): string {
    // For simple if-else with single expressions, use ternary
    if (
      expr.elseBranch &&
      expr.thenBranch.statements.length === 0 &&
      expr.thenBranch.expr
    ) {
      const cond = this.emitExpr(expr.condition);
      const then = this.emitExpr(expr.thenBranch.expr);

      if (expr.elseBranch.kind === "if") {
        const else_ = this.emitIf(expr.elseBranch);
        return `(${cond} ? ${then} : ${else_})`;
      } else if (
        expr.elseBranch.kind === "block" &&
        expr.elseBranch.statements.length === 0 &&
        expr.elseBranch.expr
      ) {
        const else_ = this.emitExpr(expr.elseBranch.expr);
        return `(${cond} ? ${then} : ${else_})`;
      }
    }

    // Complex case: use IIFE
    return this.emitIfIIFE(expr);
  }

  private emitIfIIFE(expr: any): string {
    const lines: string[] = [];
    lines.push(`(() => {`);
    lines.push(`  if (${this.emitExpr(expr.condition)}) {`);

    // Emit then branch
    for (const stmt of expr.thenBranch.statements) {
      lines.push(`    ${this.emitStmtInline(stmt)}`);
    }
    if (expr.thenBranch.expr) {
      lines.push(`    return ${this.emitExpr(expr.thenBranch.expr)};`);
    }

    lines.push(`  }`);

    if (expr.elseBranch) {
      if (expr.elseBranch.kind === "if") {
        lines.push(`  else ${this.emitIfIIFE(expr.elseBranch).slice(7)}`); // Remove "(() => "
      } else {
        lines.push(`  else {`);
        for (const stmt of expr.elseBranch.statements) {
          lines.push(`    ${this.emitStmtInline(stmt)}`);
        }
        if (expr.elseBranch.expr) {
          lines.push(`    return ${this.emitExpr(expr.elseBranch.expr)};`);
        }
        lines.push(`  }`);
      }
    }

    lines.push(`})()`);
    return lines.join("\n");
  }

  private emitStmtInline(stmt: Stmt): string {
    switch (stmt.kind) {
      case "let": {
        const pattern = this.emitPattern(stmt.pattern);
        const keyword = stmt.mutable ? "let" : "const";
        return `${keyword} ${pattern} = ${this.emitExpr(stmt.init)};`;
      }
      case "assign":
        return `${this.emitExpr(stmt.target)} = ${this.emitExpr(stmt.value)};`;
      case "expr":
        return `${this.emitExpr(stmt.expr)};`;
      case "return":
        return stmt.value ? `return ${this.emitExpr(stmt.value)};` : `return;`;
      case "break":
        return `break;`;
      case "continue":
        return `continue;`;
      default:
        return `/* unsupported: ${stmt.kind} */`;
    }
  }

  private emitMatch(expr: { scrutinee: Expr; arms: any[] }): string {
    const scrutinee = this.emitExpr(expr.scrutinee);

    // For simple variant matching, use __axon.match
    const arms = expr.arms.map((arm: any) => this.emitMatchArm(arm));

    return `__axon.match(${scrutinee}, { ${arms.join(", ")} })`;
  }

  private emitMatchArm(arm: any): string {
    const pattern = arm.pattern;

    switch (pattern.kind) {
      case "variant": {
        const body = this.emitExpr(arm.body);
        if (pattern.payload && pattern.payload.length > 0) {
          const bindings = pattern.payload
            .map((p: any) => this.emitPattern(p))
            .join(", ");
          return `${pattern.name}: (${bindings}) => ${body}`;
        }
        return `${pattern.name}: () => ${body}`;
      }

      case "wildcard":
        return `_: () => ${this.emitExpr(arm.body)}`;

      case "ident":
        return `_: (${pattern.name}) => ${this.emitExpr(arm.body)}`;

      case "literal": {
        // For literal patterns, we need a more complex approach
        // This is a simplification - full implementation would need runtime checks
        const body = this.emitExpr(arm.body);
        return `_: () => ${body}`;
      }

      default:
        return `_: () => ${this.emitExpr(arm.body)}`;
    }
  }

  private emitBlockExpr(block: BlockExpr): string {
    // If block has no statements and just an expression, emit directly
    if (block.statements.length === 0 && block.expr) {
      return this.emitExpr(block.expr);
    }

    // Otherwise use IIFE
    const lines: string[] = [];
    lines.push(`(() => {`);
    for (const stmt of block.statements) {
      lines.push(`  ${this.emitStmtInline(stmt)}`);
    }
    if (block.expr) {
      lines.push(`  return ${this.emitExpr(block.expr)};`);
    }
    lines.push(`})()`);
    return lines.join("\n");
  }

  private emitPropagate(expr: { expr: Expr }): string {
    const inner = this.emitExpr(expr.expr);
    // Generate code that extracts value or propagates error
    // This is a simplified version - real implementation would need more context
    return `((__axon_tmp) => {
  if (__axon_tmp.tag === "None" || __axon_tmp.tag === "Err") return __axon_tmp;
  return __axon_tmp.value;
})(${inner})`;
  }

  // ===========================================================================
  // Pattern Emission
  // ===========================================================================

  private emitPattern(pattern: Pattern): string {
    switch (pattern.kind) {
      case "ident":
        return pattern.name;

      case "wildcard":
        return "_";

      case "tuple": {
        const elements = pattern.elements
          .map((e) => this.emitPattern(e))
          .join(", ");
        return `[${elements}]`;
      }

      case "record": {
        const fields = pattern.fields
          .map((f) =>
            f.pattern
              ? `${f.name}: ${this.emitPattern(f.pattern)}`
              : f.name
          )
          .join(", ");
        return `{ ${fields} }`;
      }

      case "literal":
        // Literal patterns in destructuring aren't directly supported in JS
        // Would need runtime validation
        return `_`;

      case "variant":
        // Variant patterns in destructuring would need special handling
        return `_`;
    }
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private line(text: string): void {
    const indent = this.options.indent.repeat(this.indentLevel);
    this.output.push(indent + text);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Emit JavaScript code from a program.
 */
export function emit(program: Program, options?: EmitOptions): EmitResult {
  const emitter = new CodeEmitter(options);
  return emitter.emit(program);
}
