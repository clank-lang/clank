/**
 * Code Emitter
 *
 * Generates JavaScript or TypeScript code from a type-checked Clank AST.
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
  TypeExpr,
} from "../parser/ast";
import type { Type } from "../types/types";
import {
  getRuntimeCode,
  getMinimalRuntimeCode,
  getRuntimeCodeTS,
  getMinimalRuntimeCodeTS,
  getRuntimeTypes,
} from "./runtime";

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
  /** Emit TypeScript instead of JavaScript */
  typescript?: boolean | undefined;
  /** Type information from the type checker */
  typeInfo?: TypeInfo | undefined;
}

/**
 * Type information passed from the type checker to the emitter.
 */
export interface TypeInfo {
  /** Function name -> function type */
  functionTypes: Map<string, Type>;
  /** Record declarations */
  records: Map<string, RecordTypeInfo>;
  /** Sum type declarations */
  sums: Map<string, SumTypeInfo>;
}

export interface RecordTypeInfo {
  typeParams: string[];
  fields: Map<string, Type>;
}

export interface SumTypeInfo {
  typeParams: string[];
  variants: Map<string, Type[]>;
}

interface ResolvedEmitOptions {
  includeRuntime: boolean;
  minimalRuntime: boolean;
  sourceMap: boolean;
  indent: string;
  typescript: boolean;
  typeInfo: TypeInfo | null;
}

// =============================================================================
// Emit Result
// =============================================================================

export interface EmitResult {
  code: string;
  sourceMap?: string | undefined;
}

// =============================================================================
// JavaScript Reserved Words
// =============================================================================

/**
 * JavaScript reserved words and keywords that cannot be used as identifiers.
 * Includes ES6+ keywords and strict mode reserved words.
 */
const JS_RESERVED_WORDS = new Set([
  // Keywords
  "break", "case", "catch", "continue", "debugger", "default", "delete",
  "do", "else", "finally", "for", "function", "if", "in", "instanceof",
  "new", "return", "switch", "this", "throw", "try", "typeof", "var",
  "void", "while", "with",
  // ES6+ keywords
  "class", "const", "enum", "export", "extends", "import", "super",
  "implements", "interface", "let", "package", "private", "protected",
  "public", "static", "yield",
  // Future reserved words
  "await",
  // Literals that can't be used as identifiers
  "null", "true", "false",
  // Strict mode reserved words
  "arguments", "eval",
]);

/**
 * Mangle an identifier if it conflicts with a JavaScript reserved word.
 * Adds an underscore suffix to reserved words.
 */
function safeIdent(name: string): string {
  if (JS_RESERVED_WORDS.has(name)) {
    return name + "_";
  }
  return name;
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
      typescript: options.typescript ?? false,
      typeInfo: options.typeInfo ?? null,
    };
  }

  /**
   * Emit code from a program.
   */
  emit(program: Program): EmitResult {
    this.output = [];
    this.indentLevel = 0;

    // Emit runtime if requested
    if (this.options.includeRuntime) {
      const runtime = this.options.typescript
        ? (this.options.minimalRuntime ? getMinimalRuntimeCodeTS() : getRuntimeCodeTS())
        : (this.options.minimalRuntime ? getMinimalRuntimeCode() : getRuntimeCode());
      this.output.push(runtime);
      this.output.push("");
    } else if (this.options.typescript) {
      // Even without runtime, we need the type declarations
      this.output.push(getRuntimeTypes());
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
    const recName = safeIdent(decl.name);
    const fields = decl.fields.map((f) => f.name);
    const safeFields = fields.map((f) => safeIdent(f));
    const typeParams = decl.typeParams.length > 0
      ? `<${decl.typeParams.map(p => p.name).join(", ")}>`
      : "";

    if (this.options.typescript) {
      // Emit TypeScript interface
      this.line(`interface ${recName}${typeParams} {`);
      this.indentLevel++;
      for (const field of decl.fields) {
        const tsType = this.typeExprToTS(field.type);
        this.line(`${safeIdent(field.name)}: ${tsType};`);
      }
      this.indentLevel--;
      this.line(`}`);
      this.line(``);

      // Emit typed constructor
      const params = safeFields.map((f, i) =>
        `${f}: ${this.typeExprToTS(decl.fields[i].type)}`
      ).join(", ");
      const resultType = recName + typeParams;
      this.line(`function ${recName}${typeParams}(${params}): ${resultType} {`);
      this.indentLevel++;
      this.line(`return { ${safeFields.join(", ")} };`);
      this.indentLevel--;
      this.line(`}`);
    } else {
      // Emit JavaScript constructor
      const params = safeFields.join(", ");
      this.line(`function ${recName}(${params}) {`);
      this.indentLevel++;
      this.line(`return { ${params} };`);
      this.indentLevel--;
      this.line(`}`);
    }
    this.line(``);
  }

  private emitSumDecl(decl: SumDecl): void {
    const sumName = safeIdent(decl.name);
    const typeParams = decl.typeParams.length > 0
      ? `<${decl.typeParams.map(p => p.name).join(", ")}>`
      : "";

    if (this.options.typescript) {
      // Emit TypeScript union type
      const variants = decl.variants.map((variant) => {
        if (variant.fields && variant.fields.length > 0) {
          const fields = variant.fields
            .map((f, i) => `${safeIdent(f.name ?? `_${i}`)}: ${this.typeExprToTS(f.type)}`)
            .join("; ");
          return `{ tag: "${variant.name}"; ${fields} }`;
        }
        return `{ tag: "${variant.name}" }`;
      });
      this.line(`type ${sumName}${typeParams} =`);
      this.indentLevel++;
      for (let i = 0; i < variants.length; i++) {
        const sep = i < variants.length - 1 ? "" : ";";
        this.line(`| ${variants[i]}${sep}`);
      }
      this.indentLevel--;
      this.line(``);
    }

    // Emit constructors
    for (const variant of decl.variants) {
      const variantName = safeIdent(variant.name);
      if (variant.fields && variant.fields.length > 0) {
        if (this.options.typescript) {
          const params = variant.fields
            .map((f, i) => `${safeIdent(f.name ?? `_${i}`)}: ${this.typeExprToTS(f.type)}`)
            .join(", ");
          const fieldNames = variant.fields.map((f, i) => safeIdent(f.name ?? `_${i}`)).join(", ");
          const retType = sumName + typeParams;
          this.line(`function ${variantName}${typeParams}(${params}): ${retType} {`);
          this.indentLevel++;
          this.line(`return { tag: "${variant.name}", ${fieldNames} };`);
          this.indentLevel--;
          this.line(`}`);
        } else {
          const params = variant.fields
            .map((f, i) => safeIdent(f.name ?? `_${i}`))
            .join(", ");
          this.line(`function ${variantName}(${params}) {`);
          this.indentLevel++;
          this.line(`return { tag: "${variant.name}", ${params} };`);
          this.indentLevel--;
          this.line(`}`);
        }
      } else {
        if (this.options.typescript) {
          const retType = sumName + typeParams;
          this.line(
            `const ${variantName}: ${retType} = Object.freeze({ tag: "${variant.name}" });`
          );
        } else {
          this.line(
            `const ${variantName} = Object.freeze({ tag: "${variant.name}" });`
          );
        }
      }
    }
    this.line(``);
  }

  private emitFnDecl(decl: FnDecl): void {
    const fnName = safeIdent(decl.name);
    const typeParams = decl.typeParams.length > 0
      ? `<${decl.typeParams.map(p => p.name).join(", ")}>`
      : "";

    if (this.options.typescript) {
      const params = decl.params
        .map((p) => `${safeIdent(p.name)}: ${this.typeExprToTS(p.type)}`)
        .join(", ");
      const returnType = this.typeExprToTS(decl.returnType);
      this.line(`function ${fnName}${typeParams}(${params}): ${returnType} {`);
    } else {
      const params = decl.params.map((p) => safeIdent(p.name)).join(", ");
      this.line(`function ${fnName}(${params}) {`);
    }
    this.indentLevel++;
    this.emitBlock(decl.body, true);
    this.indentLevel--;
    this.line(`}`);
    this.line(``);
  }

  private emitExternalFn(decl: ExternalFnDecl): void {
    const fnName = safeIdent(decl.name);
    const typeParams = decl.typeParams.length > 0
      ? `<${decl.typeParams.map(p => p.name).join(", ")}>`
      : "";

    if (this.options.typescript) {
      const params = decl.params
        .map((p) => `${safeIdent(p.name)}: ${this.typeExprToTS(p.type)}`)
        .join(", ");
      const returnType = this.typeExprToTS(decl.returnType);
      this.line(`function ${fnName}${typeParams}(${params}): ${returnType} {`);
      this.indentLevel++;
      this.line(`return ${decl.jsName}(${decl.params.map((p) => safeIdent(p.name)).join(", ")});`);
      this.indentLevel--;
      this.line(`}`);
    } else {
      const params = decl.params.map((p) => safeIdent(p.name)).join(", ");
      this.line(`function ${fnName}(${params}) {`);
      this.indentLevel++;
      this.line(`return ${decl.jsName}(${params});`);
      this.indentLevel--;
      this.line(`}`);
    }
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
        if (this.options.typescript && stmt.type) {
          const tsType = this.typeExprToTS(stmt.type);
          this.line(`${keyword} ${pattern}: ${tsType} = ${this.emitExpr(stmt.init)};`);
        } else {
          this.line(`${keyword} ${pattern} = ${this.emitExpr(stmt.init)};`);
        }
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
        this.line(`__clank.assert(${this.emitExpr(stmt.condition)}${msg});`);
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
        if (this.options.typescript) {
          const params = expr.params
            .map((p) => p.type ? `${safeIdent(p.name)}: ${this.typeExprToTS(p.type)}` : safeIdent(p.name))
            .join(", ");
          const body = this.emitExpr(expr.body);
          return `((${params}) => ${body})`;
        } else {
          const params = expr.params.map((p) => safeIdent(p.name)).join(", ");
          const body = this.emitExpr(expr.body);
          return `((${params}) => ${body})`;
        }
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
        // Tuples become arrays in JS/TS
        const elements = expr.elements.map((e) => this.emitExpr(e)).join(", ");
        if (this.options.typescript) {
          return `[${elements}] as const`;
        }
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
        return `__clank.range(${start}, ${end}, ${inclusive})`;
      }

      case "propagate":
        // The ? operator - needs IIFE for early return semantics
        return this.emitPropagate(expr);
    }
  }

  private emitLiteral(expr: { value: { kind: string; value?: unknown; suffix?: string | null } }): string {
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

    // Map Clank operators to JS
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
   * Emit an identifier, prefixing built-in runtime functions with __clank.
   * Also handles reserved word mangling.
   */
  private emitIdent(name: string): string {
    // Built-in runtime functions that need __clank. prefix
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
      "get", "find", "any", "all", "contains", "concat", "reverse", "take", "drop", "zip",
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
      return `__clank.${name}`;
    }
    return safeIdent(name);
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

  private emitIfIIFE(expr: IfExpr): string {
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
        if (this.options.typescript && stmt.type) {
          return `${keyword} ${pattern}: ${this.typeExprToTS(stmt.type)} = ${this.emitExpr(stmt.init)};`;
        }
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

  private emitMatch(expr: { scrutinee: Expr; arms: { pattern: Pattern; body: Expr }[] }): string {
    const scrutinee = this.emitExpr(expr.scrutinee);

    // For simple variant matching, use __clank.match
    const arms = expr.arms.map((arm) => this.emitMatchArm(arm));

    return `__clank.match(${scrutinee}, { ${arms.join(", ")} })`;
  }

  private emitMatchArm(arm: { pattern: Pattern; body: Expr }): string {
    const pattern = arm.pattern;

    switch (pattern.kind) {
      case "variant": {
        const body = this.emitExpr(arm.body);
        if (pattern.payload && pattern.payload.length > 0) {
          const bindings = pattern.payload
            .map((p) => this.emitPattern(p))
            .join(", ");
          return `${pattern.name}: (${bindings}) => ${body}`;
        }
        return `${pattern.name}: () => ${body}`;
      }

      case "wildcard":
        return `_: () => ${this.emitExpr(arm.body)}`;

      case "ident":
        return `_: (${safeIdent(pattern.name)}) => ${this.emitExpr(arm.body)}`;

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
    if (this.options.typescript) {
      return `((__clank_tmp: Option<unknown> | Result<unknown, unknown>) => {
  if (__clank_tmp.tag === "None" || __clank_tmp.tag === "Err") return __clank_tmp;
  return (__clank_tmp as { value: unknown }).value;
})(${inner})`;
    }
    return `((__clank_tmp) => {
  if (__clank_tmp.tag === "None" || __clank_tmp.tag === "Err") return __clank_tmp;
  return __clank_tmp.value;
})(${inner})`;
  }

  // ===========================================================================
  // Pattern Emission
  // ===========================================================================

  private emitPattern(pattern: Pattern): string {
    switch (pattern.kind) {
      case "ident":
        return safeIdent(pattern.name);

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
  // Type Expression to TypeScript
  // ===========================================================================

  /**
   * Convert a Clank type expression (from AST) to TypeScript syntax.
   */
  private typeExprToTS(typeExpr: TypeExpr): string {
    switch (typeExpr.kind) {
      case "named": {
        const name = this.primitiveToTS(typeExpr.name);
        if (typeExpr.args.length === 0) {
          return name;
        }
        // Handle generic type applications
        if (name === "Option") {
          return `${this.typeExprToTS(typeExpr.args[0])} | null`;
        }
        if (name === "Result" && typeExpr.args.length >= 2) {
          const ok = this.typeExprToTS(typeExpr.args[0]);
          const err = this.typeExprToTS(typeExpr.args[1]);
          return `Result<${ok}, ${err}>`;
        }
        const args = typeExpr.args.map((a) => this.typeExprToTS(a)).join(", ");
        return `${name}<${args}>`;
      }

      case "array":
        return `${this.typeExprToTS(typeExpr.element)}[]`;

      case "tuple": {
        const elements = typeExpr.elements.map((e) => this.typeExprToTS(e)).join(", ");
        return `[${elements}]`;
      }

      case "function": {
        const params = typeExpr.params
          .map((p, i) => `arg${i}: ${this.typeExprToTS(p)}`)
          .join(", ");
        const ret = this.typeExprToTS(typeExpr.returnType);
        return `(${params}) => ${ret}`;
      }

      case "refined":
        // Refinements are erased at runtime, emit base type
        return this.typeExprToTS(typeExpr.base);

      case "effect":
        // Effects are erased, emit result type
        return this.typeExprToTS(typeExpr.resultType);

      case "recordType": {
        const fields = typeExpr.fields
          .map((f) => `${f.name}: ${this.typeExprToTS(f.type)}`)
          .join("; ");
        return `{ ${fields} }`;
      }
    }
  }

  /**
   * Convert Clank primitive type names to TypeScript equivalents.
   */
  private primitiveToTS(name: string): string {
    switch (name) {
      case "Int":
      case "Int32":
      case "Int64":
      case "Nat":
      case "ℤ":
      case "ℕ":
        return "bigint";
      case "Float":
      case "ℝ":
        return "number";
      case "Bool":
        return "boolean";
      case "Str":
      case "String":
        return "string";
      case "Unit":
        return "void";
      // Keep user-defined types and built-in special types as-is
      default:
        return name;
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
 * Emit code from a program.
 */
export function emit(program: Program, options?: EmitOptions): EmitResult {
  const emitter = new CodeEmitter(options);
  return emitter.emit(program);
}

/**
 * Emit TypeScript code from a program.
 */
export function emitTS(program: Program, options?: Omit<EmitOptions, "typescript">): EmitResult {
  return emit(program, { ...options, typescript: true });
}
