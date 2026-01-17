/**
 * AST to .clank source code unparser
 *
 * Converts a canonical AST back to human-readable .clank source code.
 * This enables the complete agent workflow:
 *   AST JSON → compile → iterate with repairs → serialize to .clank for git/humans
 */

import type {
  Program,
  FnDecl,
  RecDecl,
  SumDecl,
  TypeAliasDecl,
  ExternalFnDecl,
  ExternalModDecl,
  UseDecl,
  ModDecl,
  TypeParam,
  SumVariant,
  Expr,
  UnaryExpr,
  BinaryExpr,
  CallExpr,
  LambdaExpr,
  IfExpr,
  MatchExpr,
  BlockExpr,
  RecordExpr,
  RangeExpr,
  MatchArm,
  Stmt,
  LetStmt,
  ForStmt,
  WhileStmt,
  AssertStmt,
  TypeExpr,
  NamedTypeExpr,
  FunctionTypeExpr,
  RefinedTypeExpr,
  EffectTypeExpr,
  RecordTypeExpr,
  Pattern,
  RecordPattern,
  VariantPattern,
  LiteralValue,
  BinaryOp,
} from "../parser/ast";

// =============================================================================
// Options
// =============================================================================

export interface UnparseOptions {
  /** Indentation string (default: "  " - 2 spaces) */
  indent?: string;
  /** Use Unicode operators when available (default: false for portability) */
  preferUnicode?: boolean;
}

interface ResolvedOptions {
  indent: string;
  preferUnicode: boolean;
}

export interface UnparseResult {
  code: string;
}

// =============================================================================
// Operator Precedence (for minimal parenthesization)
// =============================================================================

const PRECEDENCE: Record<BinaryOp, number> = {
  // Logical OR (lowest)
  "||": 1,
  "∨": 1,
  // Logical AND
  "&&": 2,
  "∧": 2,
  // Equality
  "==": 3,
  "!=": 3,
  "≠": 3,
  // Comparison
  "<": 4,
  ">": 4,
  "<=": 4,
  "≤": 4,
  ">=": 4,
  "≥": 4,
  // Concatenation / Range would be here
  "++": 5,
  // Additive
  "+": 6,
  "-": 6,
  // Multiplicative
  "*": 7,
  "/": 7,
  "%": 7,
  // Power (highest binary)
  "^": 8,
  // Pipe (special - lowest precedence, left-to-right)
  "|>": 0,
};

// =============================================================================
// Unparser Class
// =============================================================================

class ClankUnparser {
  private output: string[] = [];
  private indentLevel = 0;
  private options: ResolvedOptions;

  constructor(options: UnparseOptions = {}) {
    this.options = {
      indent: options.indent ?? "  ",
      preferUnicode: options.preferUnicode ?? false,
    };
  }

  emit(program: Program): UnparseResult {
    this.output = [];
    this.indentLevel = 0;

    // Group declarations by kind for organized output
    const mods: ModDecl[] = [];
    const uses: UseDecl[] = [];
    const externalMods: ExternalModDecl[] = [];
    const externalFns: ExternalFnDecl[] = [];
    const types: (TypeAliasDecl | RecDecl | SumDecl)[] = [];
    const fns: FnDecl[] = [];

    for (const decl of program.declarations) {
      switch (decl.kind) {
        case "mod":
          mods.push(decl);
          break;
        case "use":
          uses.push(decl);
          break;
        case "externalMod":
          externalMods.push(decl);
          break;
        case "externalFn":
          externalFns.push(decl);
          break;
        case "typeAlias":
        case "rec":
        case "sum":
          types.push(decl);
          break;
        case "fn":
          fns.push(decl);
          break;
      }
    }

    // Emit in logical order
    let needsBlank = false;

    // Module declaration
    if (mods.length > 0) {
      for (const mod of mods) {
        this.emitModDecl(mod);
      }
      needsBlank = true;
    }

    // Use declarations
    if (uses.length > 0) {
      if (needsBlank) this.blankLine();
      for (const use of uses) {
        this.emitUseDecl(use);
      }
      needsBlank = true;
    }

    // External modules
    if (externalMods.length > 0) {
      if (needsBlank) this.blankLine();
      for (const extMod of externalMods) {
        this.emitExternalModDecl(extMod);
      }
      needsBlank = true;
    }

    // External functions (not in modules)
    if (externalFns.length > 0) {
      if (needsBlank) this.blankLine();
      for (const extFn of externalFns) {
        this.emitExternalFnDecl(extFn);
      }
      needsBlank = true;
    }

    // Type declarations
    if (types.length > 0) {
      if (needsBlank) this.blankLine();
      for (let i = 0; i < types.length; i++) {
        if (i > 0) this.blankLine();
        this.emitTypeDecl(types[i]);
      }
      needsBlank = true;
    }

    // Function declarations
    if (fns.length > 0) {
      if (needsBlank) this.blankLine();
      for (let i = 0; i < fns.length; i++) {
        if (i > 0) this.blankLine();
        this.emitFnDecl(fns[i]);
      }
    }

    return { code: this.output.join("\n") };
  }

  // ===========================================================================
  // Declaration emitters
  // ===========================================================================

  private emitModDecl(decl: ModDecl): void {
    this.line(`mod ${decl.name}`);
  }

  private emitUseDecl(decl: UseDecl): void {
    let line = "use ";
    if (decl.isExternal) {
      line += "external ";
    }
    line += decl.path.join(".");
    if (decl.items && decl.items.length > 0) {
      line += `.{${decl.items.join(", ")}}`;
    }
    if (decl.alias) {
      line += ` as ${decl.alias}`;
    }
    this.line(line);
  }

  private emitExternalModDecl(decl: ExternalModDecl): void {
    this.line(`external mod ${decl.name} = "${decl.jsModule}" {`);
    this.indentLevel++;
    for (const fn of decl.functions) {
      this.emitExternalFnDeclInMod(fn);
    }
    this.indentLevel--;
    this.line("}");
  }

  private emitExternalFnDecl(decl: ExternalFnDecl): void {
    const typeParams = this.formatTypeParams(decl.typeParams);
    const params = decl.params.map((p) => `${p.name}: ${this.formatTypeExpr(p.type)}`).join(", ");
    const returnType = this.formatTypeExpr(decl.returnType);
    this.line(`external fn ${decl.name}${typeParams}(${params}) -> ${returnType} = "${decl.jsName}"`);
  }

  private emitExternalFnDeclInMod(decl: ExternalFnDecl): void {
    const typeParams = this.formatTypeParams(decl.typeParams);
    const params = decl.params.map((p) => `${p.name}: ${this.formatTypeExpr(p.type)}`).join(", ");
    const returnType = this.formatTypeExpr(decl.returnType);
    this.line(`fn ${decl.name}${typeParams}(${params}) -> ${returnType} = "${decl.jsName}"`);
  }

  private emitTypeDecl(decl: TypeAliasDecl | RecDecl | SumDecl): void {
    switch (decl.kind) {
      case "typeAlias":
        this.emitTypeAliasDecl(decl);
        break;
      case "rec":
        this.emitRecDecl(decl);
        break;
      case "sum":
        this.emitSumDecl(decl);
        break;
    }
  }

  private emitTypeAliasDecl(decl: TypeAliasDecl): void {
    const typeParams = this.formatTypeParams(decl.typeParams);
    const type = this.formatTypeExpr(decl.type);
    this.line(`type ${decl.name}${typeParams} = ${type}`);
  }

  private emitRecDecl(decl: RecDecl): void {
    const typeParams = this.formatTypeParams(decl.typeParams);

    if (decl.fields.length === 0) {
      this.line(`rec ${decl.name}${typeParams} {}`);
      return;
    }

    // Single field can be inline
    if (decl.fields.length === 1) {
      const f = decl.fields[0];
      this.line(`rec ${decl.name}${typeParams} { ${f.name}: ${this.formatTypeExpr(f.type)} }`);
      return;
    }

    // Multiple fields: one per line
    this.line(`rec ${decl.name}${typeParams} {`);
    this.indentLevel++;
    for (const field of decl.fields) {
      this.line(`${field.name}: ${this.formatTypeExpr(field.type)},`);
    }
    this.indentLevel--;
    this.line("}");
  }

  private emitSumDecl(decl: SumDecl): void {
    const typeParams = this.formatTypeParams(decl.typeParams);

    if (decl.variants.length === 0) {
      this.line(`sum ${decl.name}${typeParams} {}`);
      return;
    }

    // Single variant can be inline
    if (decl.variants.length === 1) {
      const v = decl.variants[0];
      this.line(`sum ${decl.name}${typeParams} { ${this.formatVariant(v)} }`);
      return;
    }

    // Multiple variants: one per line
    this.line(`sum ${decl.name}${typeParams} {`);
    this.indentLevel++;
    for (const variant of decl.variants) {
      this.line(`${this.formatVariant(variant)},`);
    }
    this.indentLevel--;
    this.line("}");
  }

  private formatVariant(variant: SumVariant): string {
    if (!variant.fields || variant.fields.length === 0) {
      return variant.name;
    }
    const fields = variant.fields.map((f) => {
      if (f.name) {
        return `${f.name}: ${this.formatTypeExpr(f.type)}`;
      }
      return this.formatTypeExpr(f.type);
    });
    return `${variant.name}(${fields.join(", ")})`;
  }

  private emitFnDecl(decl: FnDecl): void {
    const typeParams = this.formatTypeParams(decl.typeParams);
    const params = decl.params.map((p) => `${p.name}: ${this.formatTypeExpr(p.type)}`).join(", ");
    const returnType = this.formatTypeExpr(decl.returnType);

    let signature = `fn ${decl.name}${typeParams}(${params}) -> ${returnType}`;

    // Preconditions and postconditions
    if (decl.precondition) {
      signature += `\n${this.currentIndent()}  pre ${this.formatExpr(decl.precondition)}`;
    }
    if (decl.postcondition) {
      signature += `\n${this.currentIndent()}  post ${this.formatExpr(decl.postcondition)}`;
    }

    // Body
    const bodyStr = this.formatBlockExpr(decl.body);
    this.line(`${signature} ${bodyStr}`);
  }

  // ===========================================================================
  // Type expression formatters
  // ===========================================================================

  private formatTypeParams(params: TypeParam[]): string {
    if (params.length === 0) return "";
    const formatted = params.map((p) => {
      if (p.constraint) {
        return `${p.name}: ${this.formatTypeExpr(p.constraint)}`;
      }
      return p.name;
    });
    return `[${formatted.join(", ")}]`;
  }

  private formatTypeExpr(type: TypeExpr): string {
    switch (type.kind) {
      case "named":
        return this.formatNamedType(type);
      case "array":
        return `[${this.formatTypeExpr(type.element)}]`;
      case "tuple":
        return `(${type.elements.map((e) => this.formatTypeExpr(e)).join(", ")})`;
      case "function":
        return this.formatFunctionType(type);
      case "refined":
        return this.formatRefinedType(type);
      case "effect":
        return this.formatEffectType(type);
      case "recordType":
        return this.formatRecordType(type);
    }
  }

  private formatNamedType(type: NamedTypeExpr): string {
    if (type.args.length === 0) {
      return type.name;
    }
    const args = type.args.map((a) => this.formatTypeExpr(a)).join(", ");
    return `${type.name}[${args}]`;
  }

  private formatFunctionType(type: FunctionTypeExpr): string {
    const params = type.params.map((p) => this.formatTypeExpr(p)).join(", ");
    const ret = this.formatTypeExpr(type.returnType);
    return `(${params}) -> ${ret}`;
  }

  private formatRefinedType(type: RefinedTypeExpr): string {
    const base = this.formatTypeExpr(type.base);
    const varName = type.varName ? `${type.varName}: ` : "";
    const pred = this.formatExpr(type.predicate);
    return `${base}{${varName}${pred}}`;
  }

  private formatEffectType(type: EffectTypeExpr): string {
    const effects = type.effects.map((e) => this.formatTypeExpr(e)).join(" + ");
    const result = this.formatTypeExpr(type.resultType);
    return `${effects} + ${result}`;
  }

  private formatRecordType(type: RecordTypeExpr): string {
    const fields = type.fields.map((f) => `${f.name}: ${this.formatTypeExpr(f.type)}`);
    const trailing = type.isOpen ? ", ..." : "";
    return `{ ${fields.join(", ")}${trailing} }`;
  }

  // ===========================================================================
  // Expression formatters
  // ===========================================================================

  private formatExpr(expr: Expr, parentPrecedence: number = 0): string {
    switch (expr.kind) {
      case "literal":
        return this.formatLiteral(expr.value);
      case "ident":
        return expr.name;
      case "unary":
        return this.formatUnaryExpr(expr);
      case "binary":
        return this.formatBinaryExpr(expr, parentPrecedence);
      case "call":
        return this.formatCallExpr(expr);
      case "index":
        return `${this.formatExpr(expr.object, 100)}[${this.formatExpr(expr.index)}]`;
      case "field":
        return `${this.formatExpr(expr.object, 100)}.${expr.field}`;
      case "lambda":
        return this.formatLambdaExpr(expr);
      case "if":
        return this.formatIfExpr(expr);
      case "match":
        return this.formatMatchExpr(expr);
      case "block":
        return this.formatBlockExpr(expr);
      case "array":
        return `[${expr.elements.map((e) => this.formatExpr(e)).join(", ")}]`;
      case "tuple":
        return `(${expr.elements.map((e) => this.formatExpr(e)).join(", ")})`;
      case "record":
        return this.formatRecordExpr(expr);
      case "range":
        return this.formatRangeExpr(expr);
      case "propagate":
        return `${this.formatExpr(expr.expr, 100)}?`;
    }
  }

  private formatLiteral(value: LiteralValue): string {
    switch (value.kind) {
      case "int": {
        const suffix = value.suffix ? value.suffix : "";
        return `${value.value}${suffix}`;
      }
      case "float":
        return value.value.toString();
      case "string":
        return this.formatStringLiteral(value.value);
      case "template":
        return this.formatTemplateLiteral(value.value);
      case "bool":
        return value.value ? "true" : "false";
      case "unit":
        return "()";
    }
  }

  private formatStringLiteral(value: string): string {
    // Check if we need multi-line string
    if (value.includes("\n")) {
      // Use triple-quoted multi-line string
      return `"""${value}"""`;
    }
    // Regular string - escape special characters
    const escaped = value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    return `"${escaped}"`;
  }

  private formatTemplateLiteral(value: string): string {
    // Template strings use backticks
    return `\`${value}\``;
  }

  private formatUnaryExpr(expr: UnaryExpr): string {
    const op = this.normalizeUnaryOp(expr.op);
    const operand = this.formatExpr(expr.operand, 100);
    return `${op}${operand}`;
  }

  private formatBinaryExpr(expr: BinaryExpr, parentPrecedence: number): string {
    const op = this.normalizeBinaryOp(expr.op);
    const prec = PRECEDENCE[expr.op];
    const left = this.formatExpr(expr.left, prec);
    const right = this.formatExpr(expr.right, prec + 1); // Right side needs higher precedence to avoid parens

    const result = `${left} ${op} ${right}`;

    // Add parentheses if parent has higher precedence
    if (prec < parentPrecedence) {
      return `(${result})`;
    }
    return result;
  }

  private normalizeUnaryOp(op: string): string {
    if (this.options.preferUnicode) {
      if (op === "!") return "¬";
    } else {
      if (op === "¬") return "!";
    }
    return op;
  }

  private normalizeBinaryOp(op: BinaryOp): string {
    if (this.options.preferUnicode) {
      switch (op) {
        case "!=":
          return "≠";
        case "<=":
          return "≤";
        case ">=":
          return "≥";
        case "&&":
          return "∧";
        case "||":
          return "∨";
      }
    } else {
      switch (op) {
        case "≠":
          return "!=";
        case "≤":
          return "<=";
        case "≥":
          return ">=";
        case "∧":
          return "&&";
        case "∨":
          return "||";
      }
    }
    return op;
  }

  private formatCallExpr(expr: CallExpr): string {
    const callee = this.formatExpr(expr.callee, 100);
    const args = expr.args.map((a) => this.formatExpr(a)).join(", ");
    return `${callee}(${args})`;
  }

  private formatLambdaExpr(expr: LambdaExpr): string {
    const params = expr.params
      .map((p) => {
        if (p.type) {
          return `${p.name}: ${this.formatTypeExpr(p.type)}`;
        }
        return p.name;
      })
      .join(", ");
    const body = this.formatExpr(expr.body);
    return `\\(${params}) -> ${body}`;
  }

  private formatIfExpr(expr: IfExpr): string {
    const cond = this.formatExpr(expr.condition);
    const thenBranch = this.formatBlockExpr(expr.thenBranch);

    if (!expr.elseBranch) {
      return `if ${cond} ${thenBranch}`;
    }

    if (expr.elseBranch.kind === "if") {
      // else-if chain
      const elseIf = this.formatIfExpr(expr.elseBranch);
      return `if ${cond} ${thenBranch} else ${elseIf}`;
    }

    const elseBranch = this.formatBlockExpr(expr.elseBranch);
    return `if ${cond} ${thenBranch} else ${elseBranch}`;
  }

  private formatMatchExpr(expr: MatchExpr): string {
    const scrutinee = this.formatExpr(expr.scrutinee);
    const arms = expr.arms.map((arm) => this.formatMatchArm(arm)).join(", ");
    return `match ${scrutinee} { ${arms} }`;
  }

  private formatMatchArm(arm: MatchArm): string {
    const pattern = this.formatPattern(arm.pattern);
    const guard = arm.guard ? ` if ${this.formatExpr(arm.guard)}` : "";
    const body = this.formatExpr(arm.body);
    return `${pattern}${guard} -> ${body}`;
  }

  private formatBlockExpr(block: BlockExpr): string {
    // Empty block with just expression
    if (block.statements.length === 0 && block.expr) {
      const exprStr = this.formatExpr(block.expr);
      // Keep simple expressions on one line
      if (!exprStr.includes("\n") && exprStr.length < 60) {
        return `{ ${exprStr} }`;
      }
    }

    // Empty block
    if (block.statements.length === 0 && !block.expr) {
      return "{}";
    }

    // Multi-statement block
    const lines: string[] = [];
    lines.push("{");

    for (const stmt of block.statements) {
      const stmtStr = this.formatStmt(stmt);
      lines.push(`${this.options.indent}${stmtStr}`);
    }

    if (block.expr) {
      const exprStr = this.formatExpr(block.expr);
      lines.push(`${this.options.indent}${exprStr}`);
    }

    lines.push("}");
    return lines.join("\n" + this.currentIndent());
  }

  private formatRecordExpr(expr: RecordExpr): string {
    const fields = expr.fields.map((f) => `${f.name}: ${this.formatExpr(f.value)}`);
    return `{ ${fields.join(", ")} }`;
  }

  private formatRangeExpr(expr: RangeExpr): string {
    const start = this.formatExpr(expr.start, 100);
    const end = this.formatExpr(expr.end, 100);
    const op = expr.inclusive ? "..=" : "..";
    return `${start}${op}${end}`;
  }

  // ===========================================================================
  // Statement formatters
  // ===========================================================================

  private formatStmt(stmt: Stmt): string {
    switch (stmt.kind) {
      case "let":
        return this.formatLetStmt(stmt);
      case "assign":
        return `${this.formatExpr(stmt.target)} = ${this.formatExpr(stmt.value)};`;
      case "expr":
        return `${this.formatExpr(stmt.expr)};`;
      case "for":
        return this.formatForStmt(stmt);
      case "while":
        return this.formatWhileStmt(stmt);
      case "loop":
        return `loop ${this.formatBlockExpr(stmt.body)}`;
      case "return":
        return stmt.value ? `return ${this.formatExpr(stmt.value)};` : "return;";
      case "break":
        return "break;";
      case "continue":
        return "continue;";
      case "assert":
        return this.formatAssertStmt(stmt);
    }
  }

  private formatLetStmt(stmt: LetStmt): string {
    const mut = stmt.mutable ? "mut " : "";
    const pattern = this.formatPattern(stmt.pattern);
    const type = stmt.type ? `: ${this.formatTypeExpr(stmt.type)}` : "";
    const init = this.formatExpr(stmt.init);
    return `let ${mut}${pattern}${type} = ${init};`;
  }

  private formatForStmt(stmt: ForStmt): string {
    const pattern = this.formatPattern(stmt.pattern);
    const iterable = this.formatExpr(stmt.iterable);
    const body = this.formatBlockExpr(stmt.body);
    return `for ${pattern} in ${iterable} ${body}`;
  }

  private formatWhileStmt(stmt: WhileStmt): string {
    const cond = this.formatExpr(stmt.condition);
    const body = this.formatBlockExpr(stmt.body);
    return `while ${cond} ${body}`;
  }

  private formatAssertStmt(stmt: AssertStmt): string {
    const cond = this.formatExpr(stmt.condition);
    if (stmt.message) {
      return `assert ${cond}, "${stmt.message}";`;
    }
    return `assert ${cond};`;
  }

  // ===========================================================================
  // Pattern formatters
  // ===========================================================================

  private formatPattern(pattern: Pattern): string {
    switch (pattern.kind) {
      case "wildcard":
        return "_";
      case "ident":
        return pattern.name;
      case "literal":
        return this.formatLiteral(pattern.value);
      case "tuple":
        return `(${pattern.elements.map((e) => this.formatPattern(e)).join(", ")})`;
      case "record":
        return this.formatRecordPattern(pattern);
      case "variant":
        return this.formatVariantPattern(pattern);
    }
  }

  private formatRecordPattern(pattern: RecordPattern): string {
    const fields = pattern.fields.map((f) => {
      if (f.pattern) {
        return `${f.name}: ${this.formatPattern(f.pattern)}`;
      }
      return f.name;
    });
    return `{ ${fields.join(", ")} }`;
  }

  private formatVariantPattern(pattern: VariantPattern): string {
    if (!pattern.payload || pattern.payload.length === 0) {
      return pattern.name;
    }
    const payload = pattern.payload.map((p) => this.formatPattern(p)).join(", ");
    return `${pattern.name}(${payload})`;
  }

  // ===========================================================================
  // Output helpers
  // ===========================================================================

  private line(text: string): void {
    const indent = this.currentIndent();
    this.output.push(indent + text);
  }

  private blankLine(): void {
    this.output.push("");
  }

  private currentIndent(): string {
    return this.options.indent.repeat(this.indentLevel);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Convert a Clank AST back to .clank source code.
 *
 * @param program - The AST to unparse
 * @param options - Formatting options
 * @returns The source code as a string
 */
export function unparse(program: Program, options?: UnparseOptions): string {
  const unparser = new ClankUnparser(options);
  return unparser.emit(program).code;
}
