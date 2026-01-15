# Axon Implementation Roadmap

**Version:** 0.1.0  
**Target Runtime:** Bun

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         axon-compiler                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐   ┌────────┐   ┌───────────────┐   ┌───────────┐  │
│  │  Lexer  │ → │ Parser │ → │  Type Checker │ → │  Codegen  │  │
│  └─────────┘   └────────┘   └───────────────┘   └───────────┘  │
│                                    │                            │
│                             ┌──────┴──────┐                     │
│                             │   Solver    │                     │
│                             │ (refinements)│                     │
│                             └─────────────┘                     │
├─────────────────────────────────────────────────────────────────┤
│                          Output                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ JavaScript  │  │ TypeScript  │  │ Structured JSON Report  │ │
│  │   (.js)     │  │ Decls (.dts)│  │  (diagnostics, oblig.)  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
axon/
├── package.json
├── tsconfig.json
├── bun.lockb
│
├── src/
│   ├── index.ts              # Main entry point
│   ├── cli.ts                # Command-line interface
│   │
│   ├── lexer/
│   │   ├── index.ts          # Lexer exports
│   │   ├── lexer.ts          # Tokenization logic
│   │   ├── tokens.ts         # Token type definitions
│   │   └── unicode.ts        # Unicode handling utilities
│   │
│   ├── parser/
│   │   ├── index.ts          # Parser exports
│   │   ├── parser.ts         # Recursive descent parser
│   │   ├── ast.ts            # AST node definitions
│   │   └── errors.ts         # Parse error handling
│   │
│   ├── types/
│   │   ├── index.ts          # Type system exports
│   │   ├── types.ts          # Type representation
│   │   ├── checker.ts        # Type checking logic
│   │   ├── inference.ts      # Type inference
│   │   ├── unify.ts          # Unification algorithm
│   │   └── subtyping.ts      # Subtype checking
│   │
│   ├── refinements/
│   │   ├── index.ts          # Refinement exports
│   │   ├── constraints.ts    # Constraint representation
│   │   ├── solver.ts         # Built-in constraint solver
│   │   └── obligations.ts    # Proof obligation generation
│   │
│   ├── effects/
│   │   ├── index.ts          # Effects exports
│   │   ├── effects.ts        # Effect type definitions
│   │   └── checker.ts        # Effect checking
│   │
│   ├── codegen/
│   │   ├── index.ts          # Codegen exports
│   │   ├── emitter.ts        # JS code emitter
│   │   ├── runtime.ts        # Runtime helpers codegen
│   │   └── dts.ts            # TypeScript declaration emitter
│   │
│   ├── diagnostics/
│   │   ├── index.ts          # Diagnostics exports
│   │   ├── diagnostic.ts     # Diagnostic type definitions
│   │   ├── reporter.ts       # Output formatting
│   │   └── codes.ts          # Error code registry
│   │
│   └── utils/
│       ├── source.ts         # Source file handling
│       ├── span.ts           # Source span utilities
│       └── result.ts         # Result type utilities
│
├── runtime/
│   ├── prelude.js            # Runtime prelude (injected)
│   └── std/                  # Standard library implementations
│       ├── core.js
│       ├── io.js
│       ├── collections.js
│       └── ...
│
├── tests/
│   ├── lexer/
│   ├── parser/
│   ├── types/
│   ├── refinements/
│   ├── codegen/
│   └── e2e/                  # End-to-end tests
│
├── examples/
│   ├── hello.ax
│   ├── factorial.ax
│   ├── refinements.ax
│   └── ...
│
└── docs/
    ├── SPEC.md               # Language specification
    ├── ROADMAP.md            # This file
    └── CONTRIBUTING.md
```

---

## Phase 1: Core Language (Weeks 1-2)

### Week 1: Lexer & Parser

**Goals:**
- [ ] Tokenize Axon source files
- [ ] Parse into AST
- [ ] Handle Unicode syntax with ASCII fallbacks
- [ ] Produce readable error messages with source locations

**Deliverables:**
- `src/lexer/*` - Complete lexer
- `src/parser/*` - Complete parser
- `tests/lexer/*` - Lexer tests
- `tests/parser/*` - Parser tests

**Key Types:**

```typescript
// tokens.ts
enum TokenKind {
  // Literals
  IntLit,
  FloatLit,
  StringLit,
  True,
  False,
  
  // Keywords
  Fn,       // ƒ or fn
  Lambda,   // λ or \
  Let,
  Mut,
  If,
  Else,
  Match,
  For,
  In,
  While,
  Return,
  Break,
  Continue,
  Type,
  Rec,
  Sum,
  Mod,
  Use,
  External,
  Pre,
  Post,
  Assert,
  Unsafe,
  Js,
  
  // Operators
  Plus,
  Minus,
  Star,
  Slash,
  Percent,
  Caret,
  Eq,
  NotEq,    // ≠ or !=
  Lt,
  Gt,
  LtEq,     // ≤ or <=
  GtEq,     // ≥ or >=
  And,      // ∧ or &&
  Or,       // ∨ or ||
  Not,      // ¬ or !
  Arrow,    // → or ->
  Pipe,     // |>
  Concat,   // ++
  Question, // ?
  
  // Delimiters
  LParen,
  RParen,
  LBracket,
  RBracket,
  LBrace,
  RBrace,
  Comma,
  Colon,
  ColonColon,
  Semicolon,
  Dot,
  
  // Special
  Ident,
  TypeIdent,
  Underscore,
  Eof,
  
  // Types (keywords)
  IntType,   // ℤ or Int
  NatType,   // ℕ or Nat
  FloatType, // ℝ or Float
  BoolType,
  StrType,
  UnitType,
}

interface Token {
  kind: TokenKind;
  span: SourceSpan;
  value?: string | bigint | number;
}
```

```typescript
// ast.ts
interface SourceSpan {
  file: string;
  start: Position;
  end: Position;
}

interface Position {
  line: number;
  column: number;
  offset: number;
}

// Expressions
type Expr =
  | LiteralExpr
  | IdentExpr
  | UnaryExpr
  | BinaryExpr
  | CallExpr
  | IndexExpr
  | FieldExpr
  | LambdaExpr
  | IfExpr
  | MatchExpr
  | BlockExpr;

interface LiteralExpr {
  kind: "literal";
  span: SourceSpan;
  value: LiteralValue;
}

type LiteralValue =
  | { kind: "int"; value: bigint }
  | { kind: "float"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "unit" };

// ... etc for all expression types

// Types (syntax)
type TypeExpr =
  | NamedType
  | ArrayType
  | TupleType
  | FnType
  | RefinedType
  | EffectType;

interface NamedType {
  kind: "named";
  span: SourceSpan;
  name: string;
  args: TypeExpr[];
}

interface RefinedType {
  kind: "refined";
  span: SourceSpan;
  base: TypeExpr;
  var?: string;  // Optional explicit var name
  predicate: Expr;
}

// Declarations
type Decl =
  | ModDecl
  | UseDecl
  | TypeAliasDecl
  | RecDecl
  | SumDecl
  | FnDecl
  | ExternalFnDecl
  | ExternalModDecl;

interface FnDecl {
  kind: "fn";
  span: SourceSpan;
  name: string;
  typeParams: TypeParam[];
  params: Param[];
  returnType: TypeExpr;
  precondition?: Expr;
  postcondition?: Expr;
  body: BlockExpr;
}

// Program
interface Program {
  declarations: Decl[];
}
```

### Week 2: Basic Type Checking & Codegen

**Goals:**
- [ ] Type check basic programs (no refinements yet)
- [ ] Generate JavaScript output
- [ ] Structured JSON diagnostic output
- [ ] CLI with compile/check/run commands

**Deliverables:**
- `src/types/*` - Basic type checker
- `src/codegen/*` - JS emitter
- `src/cli.ts` - CLI implementation
- `src/diagnostics/*` - Error reporting

**Key Algorithms:**

1. **Type checking:** Bidirectional type checking
   - `infer(ctx, expr) -> Type` - Infer expression type
   - `check(ctx, expr, expected) -> ()` - Check expression against expected type

2. **Unification:** Hindley-Milner style for generics
   - `unify(t1, t2) -> Substitution | Error`

3. **Code generation:** Direct AST traversal
   - Emit JavaScript with BigInt for integers
   - Wrap in async if effects present

**MVP Type Rules (simplified):**

```
Γ ⊢ n : ℤ                           (INT-LIT)

Γ ⊢ x : Γ(x)                        (VAR)

Γ ⊢ e1 : ℤ    Γ ⊢ e2 : ℤ
─────────────────────────            (ADD)
   Γ ⊢ e1 + e2 : ℤ

Γ, x:T ⊢ e : U
─────────────────────                (LAMBDA)
Γ ⊢ λ(x:T) → e : T → U

Γ ⊢ e1 : T → U    Γ ⊢ e2 : T
─────────────────────────────        (APP)
      Γ ⊢ e1(e2) : U
```

---

## Phase 2: Refinement Types (Weeks 3-4)

### Week 3: Refinement Representation & Parsing

**Goals:**
- [ ] Parse refinement type syntax
- [ ] Represent refinement predicates
- [ ] Generate proof obligations
- [ ] Track branch conditions

**Key Types:**

```typescript
// constraints.ts
type Predicate =
  | { kind: "true" }
  | { kind: "false" }
  | { kind: "var"; name: string }
  | { kind: "int"; value: bigint }
  | { kind: "binop"; op: BinOp; left: Predicate; right: Predicate }
  | { kind: "unop"; op: UnOp; operand: Predicate }
  | { kind: "call"; fn: string; args: Predicate[] };

type BinOp = "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||";
type UnOp = "-" | "!";

interface RefinedType {
  base: Type;
  var: string;
  predicate: Predicate;
}

// obligations.ts
interface Obligation {
  id: string;
  kind: "refinement" | "precondition" | "postcondition";
  goal: Predicate;
  location: SourceSpan;
  context: Context;
  hints: Hint[];
}

interface Context {
  bindings: Map<string, { type: Type; predicate?: Predicate }>;
  facts: Predicate[];  // Known true from branches, assertions
}
```

### Week 4: Constraint Solver

**Goals:**
- [ ] Implement simple arithmetic solver
- [ ] Auto-discharge trivial obligations
- [ ] Generate helpful hints for unsolved obligations
- [ ] Integration with type checker

**Solver Strategy:**

1. **Literal evaluation:** `3 > 0` → `true`
2. **Substitution:** Replace known values
3. **Simple arithmetic:** Linear arithmetic over integers
4. **Branch tracking:** `if x > 0 then ... ` adds `x > 0` to context

**Solver Interface:**

```typescript
type SolverResult =
  | { status: "sat" }
  | { status: "unsat"; counterexample?: Map<string, bigint> }
  | { status: "unknown"; reason: string };

function solve(ctx: Context, goal: Predicate): SolverResult;
```

**MVP Solver Capabilities:**
- Equality and inequality over integers
- Basic arithmetic (constants, +, -, *)
- Logical operators (and, or, not)
- Known function results (e.g., `len([1,2,3]) = 3`)

**NOT in MVP:**
- Full SMT solving (Z3 integration)
- Nonlinear arithmetic
- Quantifiers
- Arrays/sequences reasoning

---

## Phase 3: Effects (Weeks 4-5)

### Week 4-5: Effect System

**Goals:**
- [ ] Parse effect annotations
- [ ] Infer effects within functions
- [ ] Check effect signatures
- [ ] Generate appropriate async code

**Effect Representation:**

```typescript
// effects.ts
type Effect =
  | { kind: "pure" }
  | { kind: "io" }
  | { kind: "err"; errorType: Type }
  | { kind: "async" }
  | { kind: "mut" }
  | { kind: "union"; effects: Effect[] };

function effectSubtype(sub: Effect, sup: Effect): boolean;
function combineEffects(e1: Effect, e2: Effect): Effect;
```

**Effect Inference Rules:**
- Function body effect = union of all statement effects
- If effect = union of branch effects
- Call effect = callee's declared effect
- IO operations (print, read_file, etc.) have IO effect

**Codegen for Effects:**
- `Async` → generate `async function`, emit `await` for async calls
- `Err` → functions return `Result` type, `?` becomes early return
- `IO` → no special codegen (runtime handles it)

---

## Phase 4: JS Interop (Weeks 5-6)

### Week 5: External Declarations

**Goals:**
- [ ] Parse external function declarations
- [ ] Parse external module declarations
- [ ] Generate import statements
- [ ] Type check against declared signatures

**Codegen:**

```axon
external ƒ console_log(msg: Str) → IO[()] = "console.log"
```

Generates:

```javascript
// Just call directly
console.log(msg);
```

```axon
external mod lodash = "lodash" {
  ƒ chunk[T](arr: [T], size: ℤ{size > 0}) → [[T]]
}
use external lodash
lodash.chunk([1,2,3], 2)
```

Generates:

```javascript
import * as lodash from "lodash";
lodash.chunk([1,2,3], 2);
```

### Week 6: Raw JS & Runtime

**Goals:**
- [ ] Implement `js { }` blocks
- [ ] Implement `unsafe js[T] { }` blocks
- [ ] Runtime prelude (Result, Option helpers)
- [ ] Runtime validation helpers

---

## Phase 5: Polish (Week 6+)

### Improvements

- [ ] Better error messages with source snippets
- [ ] Source maps for debugging
- [ ] Watch mode for development
- [ ] REPL implementation
- [ ] Performance optimization

### Linear Types (Static Only)

- [ ] Parse `Linear[T]` and `Affine[T]`
- [ ] Track linear resource usage
- [ ] Error on double-use or non-consumption
- [ ] No runtime enforcement

---

## Testing Strategy

### Unit Tests
- Lexer: Token stream for various inputs
- Parser: AST structure for valid programs
- Type checker: Accept/reject programs, inferred types
- Solver: Satisfiability of constraints
- Codegen: Generated JS matches expected output

### Integration Tests
- Compile example programs
- Verify diagnostics format
- Run generated code in Bun

### E2E Tests
- Full compiler pipeline
- Diagnostic output matches spec
- Generated code executes correctly

### Property-Based Tests
- Random expression generation
- Verify: parse(print(ast)) == ast
- Verify: type check is deterministic

---

## Dependencies

```json
{
  "dependencies": {},
  "devDependencies": {
    "typescript": "^5.3",
    "bun-types": "latest"
  }
}
```

**Design Philosophy:** Minimal dependencies. The compiler should be self-contained.

**Optional future dependencies:**
- `z3-solver` - SMT solver for advanced refinements (post-MVP)

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Lex 1000 lines | < 10ms |
| Parse 1000 lines | < 50ms |
| Type check 1000 lines | < 200ms |
| Total compile 1000 lines | < 500ms |
| Memory usage | < 100MB for typical projects |

---

## CLI Specification

```
axon - The Axon compiler

USAGE:
  axon <command> [options] [files]

COMMANDS:
  compile <file>    Compile Axon to JavaScript
  check <file>      Type check without generating code
  run <file>        Compile and execute
  repl              Start interactive REPL

OPTIONS:
  -o, --output <dir>    Output directory (default: ./dist)
  --emit <format>       Output format: js, dts, json, all (default: js)
  --no-prelude          Don't include runtime prelude
  --strict              Treat warnings as errors
  --quiet               Suppress non-error output
  --version             Print version
  --help                Print help

EXAMPLES:
  axon compile main.ax -o dist/
  axon check src/**/*.ax
  axon run script.ax
  axon compile main.ax --emit=json > result.json
```

---

## Post-MVP Features (Documented for Future)

### Higher-Kinded Types

```axon
trait Functor[F[_]] {
  ƒ map[A, B](fa: F[A], f: (A) → B) → F[B]
}

impl Functor for Option {
  ƒ map[A, B](fa: Option[A], f: (A) → B) → Option[B] {
    match fa {
      Some(a) → Some(f(a)),
      None → None
    }
  }
}
```

### Full Dependent Types

```axon
// Vector with compile-time length
type Vec[T, n: ℕ]

ƒ replicate[T](n: ℕ, x: T) → Vec[T, n]

ƒ concat[T, n: ℕ, m: ℕ](a: Vec[T, n], b: Vec[T, m]) → Vec[T, n + m]
```

### Effect Handlers

```axon
effect Yield[T] {
  ƒ yield(value: T) → ()
}

ƒ generate() → Yield[ℤ, ()] {
  yield(1)
  yield(2)
  yield(3)
}

ƒ collect() → [ℤ] {
  handle generate() {
    yield(v) → resume with () // collect v somehow
  }
}
```

### Proof Tactics

```axon
ƒ sorted_insert[T: Ord](arr: [T], x: T) → [T]
  pre is_sorted(arr)
  post is_sorted(result) ∧ contains(result, x) ∧ len(result) == len(arr) + 1
{
  // implementation

  // Proof that result is sorted
  proof post.is_sorted {
    induction on arr
    case [] → trivial
    case (h :: t) → 
      if x <= h then
        // x :: h :: t is sorted because x <= h and h :: t is sorted
        apply sorted_cons with (x, h :: t)
      else
        // h :: insert(t, x) is sorted by IH
        apply IH with t
  }
}
```

---

## Claude Agent Skill

Package the Axon language specification and standard library documentation as a [Claude Agent Skill](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) for distribution.

**Goals:**
- [ ] Create skill manifest with language spec and stdlib docs
- [ ] Include compiler error code reference for LLM-friendly error handling
- [ ] Bundle example programs demonstrating idiomatic Axon patterns
- [ ] Provide structured prompts for common Axon code generation tasks

**Skill Contents:**
- Language specification (syntax, types, effects, refinements)
- Standard library API reference (std.core, std.io, std.collections, etc.)
- Error code catalog with fix suggestions
- Code examples for refinement types, effects, JS interop

This enables Claude to write Axon code with full knowledge of the language semantics and stdlib, leveraging the structured compiler feedback loop that Axon is designed for.

---

## Success Metrics

The MVP is complete when:

1. **Compiles valid Axon to working JS** - Example programs run correctly on Bun
2. **Rejects invalid programs with good errors** - Type mismatches, missing cases caught
3. **Refinement obligations work** - Trivial ones discharged, others reported with hints
4. **Effect tracking works** - IO/Err effects tracked and checked
5. **External interop works** - Can call npm packages with type safety at boundary
6. **Structured output complete** - JSON output matches spec, actionable by LLM

---

*End of roadmap*
