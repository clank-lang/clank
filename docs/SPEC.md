# Clank Language Specification

**Version:** 0.1.0-draft
**Status:** Pre-implementation specification
**Target:** Bun/JavaScript runtime

---

## Overview

Clank is an **agent-oriented IR and compiler protocol** whose canonical program representation is **AST JSON**, not `.clank` text.

### Design Philosophy

1. **AST JSON is canonical.** The primary interface for agents is structured JSON AST. Agents submit programs as JSON, receive compiler feedback as JSON, and apply patches as JSON operations.

2. **`.clank` is a debug view.** The text syntax exists for human inspection, debugging, and convenient hybrid authoring—but it is not the primary agent interface.

3. **The compiler is a repair engine.** The primary success metric is minimizing agent↔compiler iterations. The compiler outputs machine-actionable repair patches, not merely descriptive error messages.

4. **Runtime checks are the backstop.** For interop boundaries and unknown types, the compiler generates runtime validators. Static verification handles the known world; runtime checks handle the unknown.

### Priorities

| Priority | Description |
|----------|-------------|
| **Repair suggestions** | Every diagnostic should include ranked repair patches that agents can directly apply |
| **Structured feedback** | All compiler output is machine-parseable JSON with stable node references |
| **Static verification** | Refinement types, effects, and linearity catch errors before runtime |
| **JavaScript interop** | Compiles to JS/TS running on Bun with optional type declarations |
| **Human readability** | `.clank` syntax is readable for debugging; Unicode is optional sugar |

### Non-Goals

- **Token efficiency as a primary driver** — Unicode syntax is nice-to-have for the `.clank` view, but not a core design constraint
- **Human authoring ergonomics** — The language is designed for agents first; human convenience is secondary
- **Standalone execution** — Clank targets JavaScript runtimes, not native execution

### Design Intent

Clank's value proposition is **not** stronger static guarantees for their own sake. Its value is **faster and more reliable convergence** when generating new code.

This has concrete implications:

| Preference | Over |
|------------|------|
| Fewer, better repairs | Many low-confidence suggestions |
| Cleaner, boring TypeScript | Clever or compact output |
| Deterministic, recipe-based fixes | Heuristic or speculative repairs |
| Trustworthy rankings | Comprehensive but noisy results |

A compiler that emits fewer but better repairs, and cleaner but less clever TypeScript, is preferred over one that is more expressive but harder to trust.

**Repair quality and TypeScript output quality are core correctness concerns, not secondary polish items.**

### Feature Development Principles

These principles guide how new language features are designed and implemented:

1. **Repair-first design.** Every new language feature must come with at least one canonical repair pattern. If we can't define deterministic repairs for a feature's error cases, the feature is not ready.

2. **No partial implementations.** Features without deterministic repairs should be postponed, not partially implemented. A feature that produces diagnostics without actionable repairs degrades the agent experience.

3. **Solver coverage as design signal.** If a feature produces frequent `unknown` solver results without counterexamples, that's a design smell. Either the feature's semantics are too complex for the solver, or the solver needs enhancement before the feature ships.

---

## Table of Contents

1. [Repair Loop Model](#1-repair-loop-model)
2. [Lexical Structure](#2-lexical-structure)
3. [Types](#3-types)
4. [Expressions](#4-expressions)
5. [Declarations](#5-declarations)
6. [Effects](#6-effects)
7. [Refinement Types](#7-refinement-types)
8. [Linear Types](#8-linear-types)
9. [JS Interop](#9-js-interop)
10. [Standard Library](#10-standard-library)
11. [Compiler Interface](#11-compiler-interface)
12. [Post-MVP Roadmap](#12-post-mvp-roadmap)

---

## 1. Repair Loop Model

The compiler is an **oracle and suggestion engine** over AST. The intended workflow minimizes agent↔compiler iterations by providing machine-actionable repair patches.

### 1.1 Submission Modes

Agents can submit programs in two modes:

| Mode | Description | Use Case |
|------|-------------|----------|
| **Full AST** | Complete `ProgramAST` JSON | Initial submission, major restructuring |
| **Incremental Patch** | List of `PatchOp` operations | Iterative refinement (preferred) |

### 1.2 Compile Response

The compiler responds with a structured `CompileResult`:

```typescript
interface CompileResult {
  // Overall status
  status: "success" | "incomplete" | "error";

  // The canonical (possibly rewritten) AST
  // Includes desugaring, explicit effects, inserted validators
  canonical_ast: ProgramAST;

  // Diagnostics with node references
  diagnostics: Diagnostic[];

  // Outstanding proof obligations
  obligations: Obligation[];

  // Unfilled type holes
  holes: TypeHole[];

  // Ranked repair suggestions (the key feature)
  repairs: RepairCandidate[];

  // Generated artifacts (if status == "success")
  output?: {
    js: string;
    js_map?: string;
    dts?: string;
  };
}
```

### 1.3 Repair Candidates

Every diagnostic, obligation, and hole includes references to repair candidates that address it:

```typescript
interface RepairCandidate {
  // Unique identifier
  id: string;

  // Short label for the fix
  title: string;

  // How confident the compiler is this is the right fix
  confidence: "high" | "medium" | "low";

  // Safety classification (CRITICAL for agent trust)
  safety: "behavior_preserving" | "likely_preserving" | "behavior_changing";

  // Category of repair
  kind: "local_fix" | "refactor" | "boundary_validation" | "semantics_change";

  // Scope of the repair (prefer smaller)
  scope: {
    node_count: number;        // How many nodes are touched
    crosses_function: boolean; // Does it affect multiple functions?
  };

  // What this repair targets
  targets: {
    node_ids?: string[];        // AST nodes affected
    diagnostic_codes?: string[]; // Diagnostics this should resolve
    obligation_ids?: string[];   // Obligations this should discharge
    hole_ids?: string[];         // Holes this should fill
  };

  // Optional preconditions that must hold
  preconditions?: Precondition[];

  // The actual edits to apply
  edits: PatchOp[];

  // What should change after applying this repair (REQUIRED)
  expected_delta: {
    diagnostics_resolved: string[];  // Diagnostic IDs that should disappear
    obligations_discharged: string[]; // Obligation IDs that should be satisfied
    holes_filled: string[];          // Hole IDs that should be filled
  };

  // Human-readable explanation
  rationale: string;
}
```

**Safety classifications:**

| Safety | Meaning | Agent Behavior |
|--------|---------|----------------|
| `behavior_preserving` | Semantics unchanged (e.g., adding type annotation) | Apply automatically |
| `likely_preserving` | High confidence semantics unchanged (e.g., guard insertion) | Apply by default |
| `behavior_changing` | May alter runtime behavior (e.g., changing logic) | Require explicit approval |

Agents MUST default to applying only `behavior_preserving` or `likely_preserving` repairs unless the user explicitly requests a semantic change.

### 1.4 Patch Operations

The patch language for edits:

```typescript
type PatchOp =
  // Replace an entire node with a new node
  | { op: "replace_node"; node_id: string; new_node: ASTNode }

  // Insert a statement before another
  | { op: "insert_before"; target_id: string; new_statement: Statement }

  // Insert a statement after another
  | { op: "insert_after"; target_id: string; new_statement: Statement }

  // Wrap a node in a new construct (e.g., wrap expr in `if` guard)
  | { op: "wrap"; node_id: string; wrapper: ASTNode; hole_ref: string }

  // Delete a node
  | { op: "delete_node"; node_id: string }

  // Add a field to a record type
  | { op: "add_field"; type_id: string; field: FieldDecl }

  // Add a parameter to a function
  | { op: "add_param"; fn_id: string; param: ParamDecl; position?: number }

  // Add a refinement predicate to a type
  | { op: "add_refinement"; type_id: string; predicate: PredicateAST }

  // Widen a function's effect annotation
  | { op: "widen_effect"; fn_id: string; add_effects: string[] }

  // Rename a symbol
  | { op: "rename"; symbol_id: string; new_name: string };
```

### 1.5 Intended Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Workflow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Submit full AST (or patch)                                  │
│              ↓                                                   │
│  2. Receive CompileResult with repairs                          │
│              ↓                                                   │
│  3. Prioritize repairs:                                         │
│     • errors > obligations > holes > warnings                   │
│     • high confidence > medium > low                            │
│     • local_fix > refactor > semantics_change                   │
│              ↓                                                   │
│  4. Apply one repair (or small compatible batch)                │
│              ↓                                                   │
│  5. Recompile with patch                                        │
│              ↓                                                   │
│  6. Repeat until status == "success"                            │
│              ↓                                                   │
│  7. Run runtime checks at boundaries (if any)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.6 Node Identity

Every AST node has a stable `id` field for referencing across edits:

```typescript
interface ASTNode {
  id: string;      // Stable identity (e.g., "node_001", UUID)
  kind: string;    // Node type
  span?: Span;     // Optional source location
  // ... other fields per node type
}
```

Node IDs are:
- **Stable within a session** — The same node keeps the same ID across compile iterations
- **Deterministic** — IDs are assigned based on AST structure, not random
- **Referenced by diagnostics** — Errors point to `primary_node_id`, not just spans

### 1.7 Hints vs Repairs

| Hints | Repairs |
|-------|---------|
| Human-facing explanations | Agent-facing patch operations |
| Describe what to do | Specify exactly how to do it |
| May be imprecise | Machine-applicable |
| Kept for debugging/logging | Primary fix mechanism |

Hints remain in the output for human inspection, but agents should prefer `repairs` as the canonical fix mechanism.

### 1.8 Repair Quality Principles

Repair quality is a **core correctness concern**, not secondary polish. The compiler must prioritize emitting high-quality, trustworthy repairs over a large number of low-confidence suggestions.

#### Quality Over Quantity

- **Fewer, better repairs** — A small set of well-ranked, mechanically correct repairs is preferred to a broad or noisy set
- **Trustworthy rankings** — High-confidence repairs must reliably appear at the top; ranking is part of the compiler's correctness surface
- **Deterministic generation** — Repair generation should be driven by a small, well-engineered library of canonical patterns, not heuristics

#### Locality and Minimality

- **Local repairs preferred** — High-confidence repairs should target a small number of AST nodes
- **Avoid broad refactors** — If a repair requires restructuring across functions, it must be labeled `kind: "refactor"` and ranked lower
- **Minimal edits** — Prefer the smallest change that resolves the issue

#### Recipe-Based Patterns

Each repair pattern should have:
- A clear triggering condition (specific diagnostic code + context)
- A predictable AST edit sequence
- A well-defined expected outcome

Speculative or heuristic repairs should be avoided. When the compiler cannot generate a deterministic repair, it should emit no repair rather than a low-quality guess.

#### Expected Delta Requirement

Every repair MUST include an `expected_delta` describing which diagnostics, obligations, or holes it resolves. Repairs that do not reliably reduce the outstanding problem set should be demoted or removed.

#### Testability

Repair quality is a testable property. The project should maintain a repair evaluation suite that validates:
- Proposed repairs are mechanically applicable to the canonical AST
- Expected effects actually occur when repairs are applied
- High-confidence repairs appear in top-ranked results
- Repair ranking does not regress

---

## 2. Lexical Structure

### 2.1 Source Encoding

Clank source files are UTF-8 encoded with the `.clank` extension.

### 2.2 Comments

```
// Single-line comment

/* 
   Multi-line comment
   Can be nested /* like this */
*/
```

### 2.3 Keywords

Unicode canonical forms (with ASCII fallbacks):

| Unicode | ASCII | Meaning |
|---------|-------|---------|
| `ƒ` | `fn` | Function declaration |
| `λ` | `\` | Lambda expression |
| `→` | `->` | Arrow (types, lambdas) |
| `←` | `<-` | Reverse arrow (monadic bind, post-MVP) |
| `≠` | `!=` | Not equal |
| `≤` | `<=` | Less or equal |
| `≥` | `>=` | Greater or equal |
| `∧` | `&&` | Logical and |
| `∨` | `\|\|` | Logical or |
| `¬` | `!` | Logical not |

Reserved words:
```
let, mut, if, else, match, for, in, while, return, break, continue,
type, rec, sum, mod, use, external, pre, post, assert, unsafe, js,
true, false, _
```

### 2.4 Identifiers

```
identifier     ::= letter (letter | digit | '_')*
type_ident     ::= upper_letter (letter | digit | '_')*
letter         ::= 'a'..'z' | 'A'..'Z' | unicode_letter
upper_letter   ::= 'A'..'Z' | unicode_upper_letter
digit          ::= '0'..'9'
```

Identifiers starting with uppercase are type names. Identifiers starting with lowercase are values.

### 2.5 Literals

```
// Integers
42              // Inferred as ℤ
42i32           // Explicit ℤ32
42i64           // Explicit ℤ64
0x2A            // Hex
0b101010        // Binary
1_000_000       // Underscores allowed

// Floats
3.14            // ℝ
3.14e10         // Scientific notation
.5              // Leading zero optional

// Strings
"hello"         // Basic string
"line1\nline2"  // Escape sequences
`template ${x}` // Template literals (interpolation)

// Booleans
true
false

// Unit
()
```

### 2.6 Operators

**Arithmetic:** `+`, `-`, `*`, `/`, `%` (modulo), `^` (power)

**Comparison:** `==`, `≠`/`!=`, `<`, `>`, `≤`/`<=`, `≥`/`>=`

**Logical:** `∧`/`&&`, `∨`/`||`, `¬`/`!`

**String:** `++` (concatenation)

**Other:** `|>` (pipe), `.` (field access), `::` (type annotation)

### 2.7 Delimiters

```
(  )    // Grouping, tuples, function calls
[  ]    // Arrays, type parameters, indexing
{  }    // Blocks, records
,       // Separator
;       // Statement terminator (optional, newline works)
:       // Type annotation
```

---

## 3. Types

### 2.1 Primitive Types

| Type | Description | JS Representation |
|------|-------------|-------------------|
| `Bool` | Boolean | `boolean` |
| `ℤ` / `Int` | Arbitrary precision integer | `BigInt` |
| `ℤ32` / `Int32` | 32-bit signed integer | `number` |
| `ℤ64` / `Int64` | 64-bit signed integer | `BigInt` |
| `ℕ` / `Nat` | Natural number (≥0) | `BigInt` with refinement |
| `ℝ` / `Float` | IEEE 754 double | `number` |
| `Str` | UTF-8 string | `string` |
| `()` / `Unit` | Unit type | `undefined` |
| `unknown` | Unknown type (must validate) | `unknown` |
| `never` | Bottom type (no values) | `never` |

### 2.2 Compound Types

**Arrays:**
```
[T]             // Array of T, unknown length
Vec[T, n]       // Array of T with length n (compile-time known)
```

**Tuples:**
```
(T, U)          // Pair
(T, U, V)       // Triple
// etc.
```

**Records:**
```
{name: Str, age: ℤ}           // Anonymous record
{name: Str, age: ℤ, ...}      // Open record (extensible)
```

**Functions:**
```
(T) → U                       // Function from T to U
(T, U) → V                    // Multiple arguments
() → T                        // No arguments
```

**Option/Result:**
```
T?                            // Sugar for Option[T]
T!E                           // Sugar for Result[T, E] (post-MVP)
```

### 2.3 Named Types

**Type aliases:**
```
type UserId = ℤ{x > 0}
type Name = Str{len(s) > 0 ∧ len(s) ≤ 100}
type Pair[T] = (T, T)
```

**Records (product types):**
```
rec User {
  id: UserId,
  name: Name,
  email: Str,
  active: Bool
}
```

**Sum types (tagged unions):**
```
sum Option[T] {
  Some(T),
  None
}

sum Result[T, E] {
  Ok(T),
  Err(E)
}

sum Json {
  Null,
  Bool(Bool),
  Number(ℝ),
  String(Str),
  Array([Json]),
  Object(Map[Str, Json])
}
```

### 2.4 Type Parameters

**Basic generics:**
```
ƒ identity[T](x: T) → T { x }

ƒ map[T, U](arr: [T], f: (T) → U) → [U] {
  // ...
}
```

**Constrained generics:**
```
ƒ sort[T: Ord](arr: [T]) → [T] { ... }

ƒ show[T: Show](x: T) → Str { ... }

ƒ compare[T: Eq + Ord](a: T, b: T) → Ordering { ... }
```

### 2.5 Refinement Types

See [Section 6](#6-refinement-types) for full details.

```
T{predicate}            // Type T refined by predicate

// The predicate variable is implicitly named after the binding:
ƒ div(n: ℤ, d: ℤ{d ≠ 0}) → ℤ     // 'd' refers to the parameter

// Or explicitly:
type PosInt = ℤ{x | x > 0}       // 'x' is explicit
```

### 2.6 Effect Types

See [Section 5](#5-effects) for full details.

```
Pure[T]                 // No side effects
IO[T]                   // Performs I/O
Err[E, T]               // Can fail with error E
Async[T]                // Asynchronous computation
Mut[T]                  // Mutates state

// Combined effects:
IO + Err[E, T]          // Multiple effects
```

---

## 4. Expressions

### 3.1 Literals and Variables

```
42                      // Integer literal
"hello"                 // String literal
true                    // Boolean literal
x                       // Variable reference
```

### 3.2 Operators

```
a + b                   // Arithmetic
a == b                  // Comparison
a ∧ b                   // Logical
s1 ++ s2                // String concat
arr[i]                  // Indexing
record.field            // Field access
```

### 3.3 Function Calls

```
f(x)                    // Single argument
f(x, y, z)              // Multiple arguments
f()                     // No arguments
obj.method(x)           // Method syntax
x |> f                  // Pipe: same as f(x)
x |> f |> g             // Pipeline: g(f(x))
```

### 3.4 Lambdas

```
λ(x: ℤ) → x + 1         // Explicit parameter type
λx → x + 1              // Inferred parameter type
λ(x, y) → x + y         // Multiple parameters
λ() → 42                // No parameters
```

### 3.5 Let Bindings

```
let x = 5               // Immutable binding
let mut y = 10          // Mutable binding
let (a, b) = pair       // Destructuring
let {name, age} = user  // Record destructuring
```

### 3.6 Assignment

```
y = 20                  // Reassign mutable variable
arr[i] = x              // Array mutation
record.field = x        // Record field mutation
```

### 3.7 Blocks

```
{
  let x = 5
  let y = 10
  x + y                 // Last expression is the value
}
```

### 3.8 Conditionals

```
if cond {
  then_expr
} else {
  else_expr
}

// If without else (returns Unit, requires then-branch to be Unit)
if cond {
  do_something()
}

// Chained
if cond1 {
  a
} else if cond2 {
  b
} else {
  c
}
```

### 3.9 Pattern Matching

```
match value {
  Pattern1 → expr1,
  Pattern2 → expr2,
  _ → default_expr       // Wildcard
}
```

**Patterns:**
```
_                       // Wildcard (matches anything)
x                       // Variable binding
42                      // Literal
(a, b)                  // Tuple destructuring
{name, age}             // Record destructuring
Some(x)                 // Variant destructuring
None                    // Variant (no payload)
x if cond               // Guard
```

**Exhaustiveness:** The compiler enforces exhaustive matching. All cases must be covered or a wildcard used.

### 3.10 Loops

```
// For loop (iteration)
for x in collection {
  process(x)
}

// For with index
for (i, x) in collection.enumerate() {
  // ...
}

// While loop
while cond {
  body
}

// Infinite loop (must break)
loop {
  if done {
    break
  }
}
```

### 3.11 Control Flow

```
return value            // Early return from function
break                   // Exit loop
continue                // Skip to next iteration
```

### 3.12 Error Handling

```
// Result propagation (like Rust's ?)
let value = fallible_operation()?

// Match on result
match result {
  Ok(v) → use(v),
  Err(e) → handle(e)
}

// Or with combinators
result
  |> map(λx → x + 1)
  |> unwrap_or(0)
```

### 3.13 Assertions

```
assert x > 0                    // Runtime assertion + proof obligation
assert x > 0 : "x must be positive"  // With message
```

---

## 5. Declarations

### 4.1 Function Declarations

```
// Basic function
ƒ add(a: ℤ, b: ℤ) → ℤ {
  a + b
}

// With effects
ƒ greet(name: Str) → IO[()] {
  print("Hello, " ++ name)
}

// Generic function
ƒ first[T](arr: [T]) → Option[T] {
  if arr.len() > 0 {
    Some(arr[0])
  } else {
    None
  }
}

// With refinements
ƒ head[T](arr: [T]{len(arr) > 0}) → T {
  arr[0]
}

// With pre/post conditions
ƒ binary_search[T: Ord](arr: [T], target: T) → Option[ℕ]
  pre arr.is_sorted()
  post match result { Some(i) → arr[i] == target, None → true }
{
  // implementation
}
```

### 4.2 Type Declarations

```
// Alias
type UserId = ℤ{x > 0}

// Record
rec Point {
  x: ℝ,
  y: ℝ
}

// Sum type
sum Shape {
  Circle(center: Point, radius: ℝ{r > 0}),
  Rectangle(top_left: Point, width: ℝ{w > 0}, height: ℝ{h > 0})
}
```

### 4.3 Module Declarations

```
// At file top
mod geometry

// Import
use std.io.{print, read_line}
use std.collections.Map
use geometry.{Point, Shape}
use external "lodash" as _
```

### 4.4 Trait Declarations (Post-MVP)

```
trait Eq {
  ƒ eq(self, other: Self) → Bool
}

trait Ord: Eq {
  ƒ cmp(self, other: Self) → Ordering
}

impl Eq for Point {
  ƒ eq(self, other: Point) → Bool {
    self.x == other.x ∧ self.y == other.y
  }
}
```

---

## 6. Effects

### 6.1 Effect Types

Clank tracks side effects in the type system. Every function has an effect signature.

| Effect | Meaning |
|--------|---------|
| `Pure[T]` | No side effects (often implicit) |
| `IO[T]` | Performs input/output |
| `Err[E, T]` | Can fail with error type E |
| `Async[T]` | Asynchronous (returns Promise) |
| `Mut[T]` | Mutates external state |

### 6.2 Effect Inference

Within a function body, effects are inferred:

```
ƒ example() → IO + Err[MyError, Str] {
  let data = read_file("input.txt")   // IO + Err[IoError, Str]
  let parsed = parse(data)?           // Err[ParseError, Data]
  Ok(parsed.name)                     // Pure
}
// Inferred: IO + Err[IoError | ParseError, Str]
```

### 6.3 Effect Subtyping

```
Pure[T] <: IO[T]         // Pure can be used where IO expected
Pure[T] <: Err[E, T]     // Pure is a subtype of any effect
IO[T] <: IO + Err[E, T]  // Adding effects is fine
```

### 6.4 Effect Repair Patterns

Effect violations yield canonical, low-ambiguity repairs. The compiler emits these as `RepairCandidate` entries:

| Violation | Repair Pattern |
|-----------|----------------|
| Calling IO function in pure context | `widen_effect`: Add `IO` to function signature |
| Using `?` without Err effect | `widen_effect`: Add `Err` to function signature |
| Async call without await | `wrap`: Insert `await` expression |
| Missing error handling | `wrap`: Add `handle` block or `?` propagation |
| Effectful code at boundary | `refactor`: Extract to boundary function |

Example repair for E4001 (Effect not allowed):

```json
{
  "id": "repair_001",
  "title": "Add IO effect to function",
  "confidence": "high",
  "kind": "local_fix",
  "targets": { "diagnostic_codes": ["E4001"], "node_ids": ["fn_001"] },
  "edits": [
    { "op": "widen_effect", "fn_id": "fn_001", "add_effects": ["IO"] }
  ],
  "expected_delta": { "diagnostics_resolved": ["diag_001"] },
  "rationale": "Function calls println() which requires IO effect"
}
```

### 6.5 Effect Handlers (Post-MVP)

```
// Catch errors
handle fallible_operation() {
  Err(e) → default_value
}

// Run async
await async_operation()
```

---

## 7. Refinement Types

### 7.1 Syntax

```
BaseType{predicate}
BaseType{var | predicate}    // Explicit variable name
```

### 7.2 Predicates

Predicates are a subset of expressions that the solver can reason about:

- Arithmetic: `+`, `-`, `*`, `/`, `%`
- Comparison: `==`, `≠`, `<`, `>`, `≤`, `≥`
- Logical: `∧`, `∨`, `¬`
- Function calls: `len(x)`, `is_empty(x)`, etc. (must be pure, known to solver)
- Array access: `arr[i]` (with bounds)

### 7.3 Proof Obligations

When a refined type is expected, the compiler emits a proof obligation:

```
ƒ div(n: ℤ, d: ℤ{d ≠ 0}) → ℤ { n / d }

ƒ example() → ℤ {
  let x = 10
  let y = get_input()   // Returns ℤ (unrefined)
  div(x, y)             // OBLIGATION: prove y ≠ 0
}
```

### 7.4 Automatic Discharge

The compiler automatically discharges trivial obligations:

```
div(10, 2)              // Auto-discharged: 2 ≠ 0 is trivially true
div(x, x + 1)           // May need solver: is x + 1 ≠ 0?
```

### 7.5 Branch Conditions

The compiler tracks information from branches:

```
ƒ safe_div(n: ℤ, d: ℤ) → Option[ℤ] {
  if d ≠ 0 {
    Some(div(n, d))     // OK: branch condition proves d ≠ 0
  } else {
    None
  }
}
```

### 7.6 Solver Feedback and Counterexamples

When obligations cannot be discharged, the solver MUST provide structured feedback:

| Result | Meaning | Required Fields |
|--------|---------|-----------------|
| `discharged` | Obligation proven | None |
| `counterexample` | Found violating assignment | `counterexample` object |
| `unknown` | Cannot prove or disprove | `unknown_reason` object |

**Counterexamples are preferred** over `unknown` when feasible. A counterexample gives the agent concrete values that violate the predicate:

```json
{
  "id": "obl_001",
  "goal": "y ≠ 0",
  "solver_result": "counterexample",
  "counterexample": { "y": "0" },
  "repair_refs": ["repair_guard_001", "repair_refine_001"]
}
```

When `unknown`, the solver must explain why:

```json
{
  "id": "obl_002",
  "goal": "len(result) == len(input)",
  "solver_result": "unknown",
  "unknown_reason": {
    "category": "incomplete_facts",
    "missing_fact": "need len(filter(f, xs)) <= len(xs)",
    "description": "Solver lacks facts about filter's length behavior"
  },
  "repair_refs": ["repair_assert_001"]
}
```

### 7.7 Refinement Repair Patterns

When obligations fail, the compiler emits repair candidates:

| Situation | Repair Pattern |
|-----------|----------------|
| Need guard | `wrap`: Insert `if pred { ... }` around expression |
| Need assertion | `insert_before`: Add `assert pred` statement |
| Parameter too weak | `add_refinement`: Strengthen parameter type |
| Missing fact | `insert_before`: Add let binding that establishes fact |

### 7.8 Pre/Post Conditions

```
ƒ binary_search[T: Ord](arr: [T], target: T) → Option[ℕ{i < len(arr)}]
  pre is_sorted(arr)
  post match result {
    Some(i) → arr[i] == target,
    None → ¬contains(arr, target)
  }
{
  // implementation
}
```

Preconditions become proof obligations at call sites.
Postconditions can be assumed in the caller after the call.

---

## 8. Linear Types

### 7.1 Purpose

Linear types ensure resources are used exactly once. This enables:
- Safe resource management (files, connections)
- Move semantics without garbage collection overhead
- Protocol verification (state machines)

### 7.2 Syntax

```
Linear[T]               // Must be used exactly once
Affine[T]               // Must be used at most once (can drop)
```

### 7.3 Examples

```
ƒ open_file(path: Str) → IO[Linear[FileHandle]]

ƒ read_all(h: Linear[FileHandle]) → IO[(Str, Linear[FileHandle])] {
  // Returns the handle so it can be used again or closed
}

ƒ close_file(h: Linear[FileHandle]) → IO[()] {
  // Consumes the handle
}

ƒ example() → IO[()] {
  let h = open_file("test.txt")
  let (contents, h) = read_all(h)
  close_file(h)                     // h consumed
  // h cannot be used here
}
```

### 7.4 Compiler Enforcement

The compiler tracks linear resources:

```
ƒ bad_example() → IO[()] {
  let h = open_file("test.txt")
  // ERROR: Linear resource 'h' not consumed
}

ƒ also_bad() → IO[()] {
  let h = open_file("test.txt")
  close_file(h)
  close_file(h)   // ERROR: Linear resource 'h' already consumed at line N
}
```

### 7.5 MVP Scope

For MVP, linear types are:
- Statically checked by the Clank compiler
- Erased at runtime (no JS enforcement)
- Limited to explicit `Linear[T]` annotations

Post-MVP: more sophisticated tracking, borrowing, etc.

---

## 9. JS Interop

### 9.1 External Functions

```
// Simple external
external ƒ console_log(msg: Str) → IO[()] = "console.log"

// With different JS name
external ƒ now() → ℤ = "Date.now"

// Generic (type parameters not checked at boundary)
external ƒ json_parse[T](s: Str) → Err[JsonError, T] = "JSON.parse"
```

### 9.2 External Modules

```
external mod lodash = "lodash" {
  ƒ chunk[T](arr: [T], size: ℤ{size > 0}) → [[T]]
  ƒ uniq[T: Eq](arr: [T]) → [T]
  ƒ debounce[T](f: T, wait: ℤ) → T
}

use external lodash

ƒ example() → [[ℤ]] {
  lodash.chunk([1, 2, 3, 4, 5], 2)
}
```

### 9.3 Raw JS Escape Hatch

```
// Returns unknown, must be validated
let result: unknown = js {
  return window.location.href;
}

// Unsafe: trust me on the type
let result = unsafe js[Str] {
  return window.location.href;
}
```

### 9.4 Runtime Validation (Boundary Repair)

When values originate from unknown or external JS boundaries, the compiler emits repair candidates that insert runtime validation.

```
// Validate unknown values
ƒ validate_user(x: unknown) → Result[User, ValidationError] {
  // Built-in runtime type checking
  validate[User](x)
}
```

**Runtime validation is a deliberate boundary repair, not a failure.** The compiler treats these as standard repair candidates:

| Boundary | Repair Pattern |
|----------|----------------|
| `JSON.parse` result | `wrap`: Insert `validate[T](x)` |
| External module return | `wrap`: Insert runtime check |
| `js { }` escape hatch | `wrap`: Require validation or `unsafe` |
| User input | `wrap`: Insert validation function |

Example repair for boundary code:

```json
{
  "id": "repair_validate_001",
  "title": "Add runtime validation for JSON parse result",
  "confidence": "high",
  "kind": "boundary_validation",
  "targets": { "node_ids": ["expr_042"] },
  "edits": [
    {
      "op": "wrap",
      "node_id": "expr_042",
      "wrapper": {
        "kind": "call",
        "callee": { "kind": "ident", "name": "validate" },
        "typeArgs": [{ "kind": "named", "name": "User" }],
        "args": [{ "hole_ref": "wrapped_expr" }]
      },
      "hole_ref": "wrapped_expr"
    }
  ],
  "expected_delta": { "diagnostics_resolved": ["diag_015"] },
  "rationale": "JSON.parse returns unknown; validate[User] provides runtime type checking"
}
```

### 9.5 TypeScript Output Quality

The generated TypeScript is the **primary user-facing artifact** and must be idiomatic, readable, and boring. The output should look like code written by a competent human TypeScript developer, not like compiler output.

#### Output Contract

The compiler follows a stable and explicit TypeScript output contract:

| Aspect | Requirement |
|--------|-------------|
| **Async/await** | Use `async`/`await`, not Promise chaining |
| **Variable declarations** | Prefer `const` over `let` unless mutation required |
| **Naming** | Predictable, consistent conventions matching source names |
| **Temporaries** | Avoid unnecessary temporary variables or helper constructs |
| **Formatting** | Stable, automated formatting suitable for direct commit |

#### Example

```clank
ƒ factorial(n: ℕ) → ℕ {
  if n ≤ 1 {
    1
  } else {
    n * factorial(n - 1)
  }
}
```

Compiles to:

```typescript
function factorial(n: bigint): bigint {
  if (n <= 1n) {
    return 1n;
  } else {
    return n * factorial(n - 1n);
  }
}
```

#### Runtime Helpers

All unusual or compiler-specific behavior should be isolated in runtime helper modules rather than inlined into generated code. Generated TypeScript should be easy to read, review, and debug without knowledge of Clank's internal representation.

```typescript
// Runtime helpers are imported, not inlined
import { validate, refinementCheck } from "@clank/runtime";
```

#### Snapshot Testing

The project maintains a TypeScript output snapshot suite. Canonical examples are compiled and compared against golden TypeScript outputs to prevent regressions in readability or style.

#### Debug Mode (Optional)

The compiler may support a debug-oriented emission mode (`--emit=ts-debug`) that includes:
- Source mapping comments
- Type annotations in comments
- Refinement check locations

However, the default output mode prioritizes cleanliness and idiomatic style over debuggability.

---

## 10. Standard Library

### 9.1 std.core (Auto-imported)

```
// Option type
sum Option[T] {
  Some(T),
  None
}

// Result type  
sum Result[T, E] {
  Ok(T),
  Err(E)
}

// Ordering
sum Ordering {
  Less,
  Equal,
  Greater
}

// Core traits
trait Eq {
  ƒ eq(self, other: Self) → Bool
}

trait Ord: Eq {
  ƒ cmp(self, other: Self) → Ordering
}

trait Show {
  ƒ show(self) → Str
}

trait Hash {
  ƒ hash(self) → ℤ
}

// Panic
ƒ panic(msg: Str) → never
ƒ unreachable() → never
ƒ todo(msg: Str) → never
```

### 9.2 std.io

```
ƒ print(s: Str) → IO[()]
ƒ println(s: Str) → IO[()]
ƒ eprint(s: Str) → IO[()]
ƒ eprintln(s: Str) → IO[()]

ƒ read_line() → IO[Str]

ƒ read_file(path: Str) → IO + Err[IoError, Str]
ƒ write_file(path: Str, contents: Str) → IO + Err[IoError, ()]
ƒ append_file(path: Str, contents: Str) → IO + Err[IoError, ()]
ƒ file_exists(path: Str) → IO[Bool]
ƒ delete_file(path: Str) → IO + Err[IoError, ()]
```

### 9.3 std.async

```
ƒ sleep(ms: ℤ{ms ≥ 0}) → Async[()]
ƒ timeout[T](ms: ℤ{ms ≥ 0}, f: () → Async[T]) → Async[Option[T]]

ƒ parallel[T]([Async[T]]) → Async[[T]]
ƒ race[T]([Async[T]]) → Async[T]
```

### 9.4 std.collections

```
// Map operations
type Map[K: Hash + Eq, V]

ƒ Map.new[K, V]() → Map[K, V]
ƒ Map.get[K, V](self, key: K) → Option[V]
ƒ Map.set[K, V](self, key: K, value: V) → Map[K, V]
ƒ Map.has[K, V](self, key: K) → Bool
ƒ Map.delete[K, V](self, key: K) → Map[K, V]
ƒ Map.keys[K, V](self) → [K]
ƒ Map.values[K, V](self) → [V]

// Set operations
type Set[T: Hash + Eq]

ƒ Set.new[T]() → Set[T]
ƒ Set.add[T](self, item: T) → Set[T]
ƒ Set.has[T](self, item: T) → Bool
ƒ Set.delete[T](self, item: T) → Set[T]
ƒ Set.union[T](self, other: Set[T]) → Set[T]
ƒ Set.intersect[T](self, other: Set[T]) → Set[T]

// Array/Vec operations
ƒ len[T](arr: [T]) → ℕ
ƒ is_empty[T](arr: [T]) → Bool
ƒ push[T](arr: [T], item: T) → [T]
ƒ pop[T](arr: [T]{len(arr) > 0}) → ([T], T)
ƒ concat[T](a: [T], b: [T]) → [T]
ƒ map[T, U](arr: [T], f: (T) → U) → [U]
ƒ filter[T](arr: [T], pred: (T) → Bool) → [T]
ƒ fold[T, U](arr: [T], init: U, f: (U, T) → U) → U
ƒ find[T](arr: [T], pred: (T) → Bool) → Option[T]
ƒ any[T](arr: [T], pred: (T) → Bool) → Bool
ƒ all[T](arr: [T], pred: (T) → Bool) → Bool
ƒ sort[T: Ord](arr: [T]) → [T]
ƒ reverse[T](arr: [T]) → [T]
ƒ take[T](arr: [T], n: ℕ) → [T]
ƒ drop[T](arr: [T], n: ℕ) → [T]
ƒ zip[T, U](a: [T], b: [U]) → [(T, U)]
```

### 9.5 std.str

```
ƒ str_len(s: Str) → ℕ
ƒ is_blank(s: Str) → Bool
ƒ trim(s: Str) → Str
ƒ trim_start(s: Str) → Str
ƒ trim_end(s: Str) → Str
ƒ to_upper(s: Str) → Str
ƒ to_lower(s: Str) → Str
ƒ split(s: Str, delim: Str) → [Str]
ƒ join(parts: [Str], delim: Str) → Str
ƒ replace(s: Str, from: Str, to: Str) → Str
ƒ starts_with(s: Str, prefix: Str) → Bool
ƒ ends_with(s: Str, suffix: Str) → Bool
ƒ contains(s: Str, substr: Str) → Bool
ƒ char_at(s: Str, i: ℕ{i < str_len(s)}) → Str
ƒ substring(s: Str, start: ℕ, end: ℕ{start ≤ end}) → Str
```

### 9.6 std.json

```
sum Json {
  Null,
  Bool(Bool),
  Number(ℝ),
  String(Str),
  Array([Json]),
  Object(Map[Str, Json])
}

ƒ json_parse(s: Str) → Err[JsonError, Json]
ƒ json_stringify(j: Json) → Str
ƒ json_stringify_pretty(j: Json) → Str

// Typed parsing (post-MVP with schemas)
ƒ json_decode[T: FromJson](s: Str) → Err[JsonError, T]
ƒ json_encode[T: ToJson](value: T) → Str
```

### 9.7 std.math

```
ƒ abs(x: ℤ) → ℕ
ƒ abs_float(x: ℝ) → ℝ{r ≥ 0}
ƒ min[T: Ord](a: T, b: T) → T
ƒ max[T: Ord](a: T, b: T) → T
ƒ clamp[T: Ord](x: T, low: T, high: T{high ≥ low}) → T{r ≥ low ∧ r ≤ high}

ƒ floor(x: ℝ) → ℤ
ƒ ceil(x: ℝ) → ℤ
ƒ round(x: ℝ) → ℤ
ƒ trunc(x: ℝ) → ℤ

ƒ sqrt(x: ℝ{x ≥ 0}) → ℝ{r ≥ 0}
ƒ pow(base: ℝ, exp: ℝ) → ℝ
ƒ log(x: ℝ{x > 0}) → ℝ
ƒ log10(x: ℝ{x > 0}) → ℝ
ƒ exp(x: ℝ) → ℝ{r > 0}

ƒ sin(x: ℝ) → ℝ{r ≥ -1 ∧ r ≤ 1}
ƒ cos(x: ℝ) → ℝ{r ≥ -1 ∧ r ≤ 1}
ƒ tan(x: ℝ) → ℝ

const PI: ℝ = 3.141592653589793
const E: ℝ = 2.718281828459045
```

---

## 11. Compiler Interface

### 11.1 Invocation

```bash
# Compile from source (debug view)
clank compile main.clank -o dist/

# Type check only (no codegen)
clank check main.clank

# Run directly (compile + execute)
clank run main.clank

# REPL (human debugging)
clank repl
```

### 11.2 Agent-Oriented CLI

The canonical interface for agents uses AST JSON input/output:

```bash
# Input modes
clank compile program.json --input=ast      # Full AST (canonical)
clank compile patch.json --input=patch      # Incremental patch ops

# Output modes (default includes repairs)
clank compile program.json --input=ast      # Full result with repairs
clank compile program.json --emit=repairs   # Repairs only
clank compile program.json --emit=ast       # Canonical AST export
clank compile program.json --emit=js        # JavaScript only
clank compile program.json --emit=all       # Everything

# Round-trip example
clank compile main.clank --emit=ast > ast.json
# ... agent modifies ast.json ...
clank compile ast.json --input=ast -o dist/
```

**Key principle:** Text-based source input/output remains supported but is non-canonical. Agents should prefer `--input=ast` and operate on the `canonical_ast` returned by the compiler.

### 11.3 AST-as-JSON (Canonical Representation)

The canonical representation of a Clank program is its AST encoded as JSON. The `.clank` text syntax is a non-canonical debug view.

#### Node Identity

Every AST node includes a stable `id` field:

```json
{
  "id": "prog_001",
  "kind": "program",
  "declarations": [
    {
      "id": "fn_001",
      "kind": "fn",
      "name": "main",
      "params": [],
      "returnType": { "id": "type_001", "kind": "named", "name": "Int" },
      "body": {
        "id": "block_001",
        "kind": "block",
        "statements": [],
        "expr": { "id": "lit_001", "kind": "literal", "value": { "kind": "int", "value": "42" } }
      }
    }
  ]
}
```

Node IDs are:
- **Required on output** — The compiler always emits IDs
- **Optional on input** — The compiler assigns IDs to nodes without them
- **Stable across iterations** — Same node keeps same ID through compile cycles
- **Referenced by diagnostics** — Errors point to `primary_node_id`, not just spans

#### Input AST

```bash
clank compile program.json --input=ast -o dist/
```

Compiles a JSON AST to JavaScript. IDs are assigned to nodes missing them.

#### Node Kinds

| Category | Kinds |
|----------|-------|
| Declarations | `fn`, `rec`, `sum`, `typeAlias`, `externalFn`, `use`, `mod` |
| Expressions | `literal`, `ident`, `binary`, `unary`, `call`, `if`, `match`, `block`, `array`, `tuple`, `record`, `lambda`, `field`, `index`, `range`, `propagate` |
| Statements | `let`, `assign`, `expr`, `for`, `while`, `loop`, `return`, `break`, `continue`, `assert` |
| Types | `named`, `array`, `tuple`, `function`, `refined`, `effect`, `recordType` |
| Patterns | `wildcard`, `ident`, `literal`, `tuple`, `record`, `variant` |

#### Source Fragments (Hybrid Authoring)

Any node can include a `source` field instead of structured children. This is a convenience for:
- Human debugging and inspection
- Hybrid generation when subtrees are easier to write as text
- Fallback when agents find text generation more efficient

```json
{
  "id": "fn_002",
  "kind": "fn",
  "name": "add",
  "params": [
    { "name": "a", "type": { "source": "Int" } },
    { "name": "b", "type": { "source": "Int" } }
  ],
  "returnType": { "source": "Int" },
  "body": { "source": "{ a + b }" }
}
```

**Important:** Source fragments are parsed and converted to canonical AST on input. The `canonical_ast` in `CompileResult` always contains fully structured nodes, not source fragments.

#### BigInt Handling

Integer literals use strings in JSON (since JSON lacks BigInt):

```json
{ "kind": "literal", "value": { "kind": "int", "value": "9007199254740993" } }
```

#### Spans

Source spans are optional on input (synthesized automatically):

```json
{
  "kind": "ident",
  "name": "x",
  "span": {
    "file": "main.clank",
    "start": { "line": 1, "column": 5, "offset": 4 },
    "end": { "line": 1, "column": 6, "offset": 5 }
  }
}
```

### 11.4 Compiler Output Schema

The compiler output is designed for machine consumption. Every compile returns actionable repair candidates.

```typescript
interface CompileResult {
  // Overall status
  status: "success" | "incomplete" | "error";

  // Version info
  compiler_version: string;

  // The canonical (normalized) AST
  // Includes desugaring, explicit effects, inserted validators
  // Agents should operate on this, not their original submission
  canonical_ast: ProgramAST;

  // Ranked repair suggestions (the primary feedback mechanism)
  repairs: RepairCandidate[];

  // Diagnostics with node references
  diagnostics: Diagnostic[];

  // Outstanding proof obligations
  obligations: Obligation[];

  // Unfilled type holes (synthesis requests)
  holes: TypeHole[];

  // Generated artifacts (if status == "success")
  output?: {
    js: string;              // Generated JavaScript/TypeScript
    js_map?: string;         // Source map
    dts?: string;            // TypeScript declarations
  };

  // Statistics
  stats: CompileStats;
}
```

#### Diagnostics (Edit-Oriented)

Diagnostics reference nodes by ID and link to repair candidates:

```typescript
interface Diagnostic {
  // Unique ID for this diagnostic
  id: string;

  // Severity level
  severity: "error" | "warning" | "info" | "hint";

  // Error code for categorization
  code: string;  // e.g., "E0001", "W0042"

  // Human-readable message
  message: string;

  // Primary node where the error occurs
  primary_node_id: string;

  // Secondary nodes involved (e.g., conflicting declaration)
  secondary_node_ids?: string[];

  // Source location (for human debugging)
  location: SourceSpan;

  // Machine-readable structured data
  structured: {
    kind: string;           // e.g., "type_mismatch", "unresolved_name"
    expected?: string;      // Expected type/value
    actual?: string;        // Actual type/value
    [key: string]: unknown; // Additional context
  };

  // IDs of RepairCandidates that address this diagnostic
  repair_refs: string[];

  // Human-facing hints (secondary to repairs)
  hints: Hint[];

  // Related locations
  related: RelatedInfo[];
}
```

#### Obligations (With Counterexamples)

Proof obligations include solver results and repair references:

```typescript
interface Obligation {
  // Unique ID for this obligation
  id: string;

  // What kind of proof is needed
  kind: "refinement" | "precondition" | "postcondition" | "effect" | "linearity";

  // The proposition to prove
  goal: string;  // e.g., "d ≠ 0"

  // Node where this obligation arises
  primary_node_id: string;

  // Source location (for human debugging)
  location: SourceSpan;

  // Available context for proving
  context: {
    bindings: Binding[];
    facts: Fact[];
  };

  // Solver result (required)
  solver_result: "discharged" | "counterexample" | "unknown";

  // Counterexample (required if solver_result == "counterexample")
  // Preferred over "unknown" when possible
  counterexample?: { [variable: string]: string };

  // Why unknown (required if solver_result == "unknown")
  unknown_reason?: {
    category: "incomplete_facts" | "nonlinear" | "quantified" | "timeout" | "unsupported";
    missing_fact?: string;  // e.g., "need x > 0"
    description: string;
  };

  // IDs of RepairCandidates that address this obligation
  repair_refs: string[];

  // Human-facing hints (secondary to repairs)
  hints: Hint[];
}
```

#### Type Holes (Synthesis Requests)

Type holes are not just placeholders—they are synthesis goals with candidate fills:

```typescript
interface TypeHole {
  // Unique ID for this hole
  id: string;

  // Node ID of the hole in the AST
  node_id: string;

  // Source location (for human debugging)
  location: SourceSpan;

  // The type that must be satisfied
  goal_type: string;

  // What effects are allowed in this context
  allowed_effects: string[];  // e.g., ["IO", "Err"]

  // Variables in scope that could be used
  in_scope_bindings: Binding[];

  // Candidate expressions that would fill this hole
  // Expressed as RepairCandidates with ReplaceNode ops
  fill_candidates: string[];  // RepairCandidate IDs

  // IDs of RepairCandidates that address this hole
  repair_refs: string[];
}
```

#### Supporting Types

```typescript
interface Hint {
  // Strategy name
  strategy: string;  // e.g., "add_guard", "strengthen_type", "split_cases"

  // Human-readable description
  description: string;

  // Code template (for human reference)
  template?: string;

  // Confidence level
  confidence: "high" | "medium" | "low";
}

interface SourceSpan {
  file: string;
  start: Position;
  end: Position;
  snippet?: string;  // The source text
}

interface Position {
  line: number;    // 1-indexed
  column: number;  // 1-indexed
  offset: number;  // 0-indexed byte offset
}

interface Binding {
  name: string;
  type: string;
  mutable: boolean;
  source: "parameter" | "let" | "for" | "match";
}

interface Fact {
  proposition: string;
  source: string;  // e.g., "branch_condition:line_42", "assertion:line_50"
}

interface RelatedInfo {
  message: string;
  location: SourceSpan;
}

interface CompileStats {
  source_files: number;
  source_lines: number;
  source_tokens: number;
  output_lines: number;
  output_bytes: number;
  obligations_total: number;
  obligations_discharged: number;
  compile_time_ms: number;
}
```

### 11.5 Error Codes

**E0xxx - Syntax Errors:**
- `E0001` - Unexpected token
- `E0002` - Unterminated string
- `E0003` - Invalid numeric literal
- `E0004` - Mismatched brackets

**E1xxx - Name Resolution:**
- `E1001` - Unresolved name
- `E1002` - Duplicate definition
- `E1003` - Import not found
- `E1004` - Module not found

**E2xxx - Type Errors:**
- `E2001` - Type mismatch
- `E2002` - Arity mismatch
- `E2003` - Missing field
- `E2004` - Unknown field
- `E2005` - Not callable
- `E2006` - Not indexable
- `E2007` - Missing type annotation
- `E2008` - Recursive type without indirection

**E3xxx - Refinement Errors:**
- `E3001` - Unprovable refinement
- `E3002` - Precondition not satisfied
- `E3003` - Postcondition not satisfied
- `E3004` - Assertion unprovable

**E4xxx - Effect Errors:**
- `E4001` - Effect not allowed
- `E4002` - Unhandled effect
- `E4003` - Effect mismatch

**E5xxx - Linearity Errors:**
- `E5001` - Linear value not consumed
- `E5002` - Linear value used multiple times
- `E5003` - Linear value escapes scope

**W0xxx - Warnings:**
- `W0001` - Unused variable
- `W0002` - Unused import
- `W0003` - Unreachable code
- `W0004` - Shadowed variable

### 11.6 Example Compiler Output

**Input (main.clank):**
```clank
ƒ div(n: ℤ, d: ℤ{d ≠ 0}) → ℤ {
  n / d
}

ƒ main() → IO[()] {
  let x = 10
  let y = get_value()  // Returns ℤ
  println(div(x, y).show())
}
```

**Output (JSON):**
```json
{
  "status": "incomplete",
  "compiler_version": "0.1.0",
  "output": null,
  "diagnostics": [],
  "obligations": [
    {
      "id": "obl_001",
      "kind": "refinement",
      "goal": "y ≠ 0",
      "location": {
        "file": "main.clank",
        "start": {"line": 8, "column": 11, "offset": 142},
        "end": {"line": 8, "column": 21, "offset": 152},
        "snippet": "div(x, y)"
      },
      "context": {
        "bindings": [
          {"name": "x", "type": "ℤ", "mutable": false, "source": "let"},
          {"name": "y", "type": "ℤ", "mutable": false, "source": "let"}
        ],
        "facts": []
      },
      "hints": [
        {
          "strategy": "guard",
          "description": "Add a guard to check the condition",
          "template": "if y != 0 { ... }",
          "confidence": "high"
        },
        {
          "strategy": "refine_param",
          "description": "Strengthen parameter 'y' with refinement",
          "template": "y: Int{y != 0}",
          "confidence": "medium"
        },
        {
          "strategy": "assert",
          "description": "Add an assertion to assume the condition",
          "template": "assert y != 0",
          "confidence": "medium"
        },
        {
          "strategy": "info",
          "description": "Known facts: y: type: Int; no constraints",
          "confidence": "low"
        }
      ],
      "solver_attempted": true,
      "solver_result": "unknown"
    }
  ],
  "holes": [],
  "stats": {
    "source_files": 1,
    "source_lines": 9,
    "source_tokens": 47,
    "output_lines": 0,
    "output_bytes": 0,
    "obligations_total": 1,
    "obligations_discharged": 0,
    "compile_time_ms": 23
  }
}
```

---

## 12. Post-MVP Roadmap

### Phase 2: Enhanced Type System
- [ ] Higher-kinded types (`Functor`, `Monad`, etc.)
- [ ] GADTs (Generalized Algebraic Data Types)
- [ ] Type-level computation
- [ ] Full dependent types (beyond refinements)

### Phase 3: Advanced Proofs
- [ ] Tactics language for complex proofs
- [ ] Full SMT solver integration (Z3)
- [ ] Proof caching and reuse
- [ ] Counterexample generation

### Phase 4: Better Effects
- [ ] Effect polymorphism
- [ ] Effect handlers (algebraic effects)
- [ ] Resource-aware effects
- [ ] Async/await with cancellation

### Phase 5: Tooling
- [ ] Language Server Protocol (LSP) implementation
- [ ] Incremental compilation
- [ ] Source maps for debugging
- [ ] Documentation generator
- [ ] Package manager integration

### Phase 6: Performance
- [ ] Optimization passes
- [ ] Dead code elimination
- [ ] Inlining
- [ ] Specialization for known types

### Phase 7: Ecosystem
- [ ] Standard library expansion
- [ ] Type definitions for popular npm packages
- [ ] Web framework bindings
- [ ] Database client wrappers

---

## Appendix A: Grammar (EBNF)

```ebnf
(* Top-level *)
program        = { declaration } ;
declaration    = mod_decl | use_decl | type_decl | fn_decl | external_decl ;

(* Modules *)
mod_decl       = "mod" , ident ;
use_decl       = "use" , use_path , [ use_list ] ;
use_path       = ident , { "." , ident } ;
use_list       = "." , "{" , ident , { "," , ident } , "}" ;

(* Types *)
type_decl      = type_alias | rec_decl | sum_decl ;
type_alias     = "type" , type_ident , [ type_params ] , "=" , type_expr ;
rec_decl       = "rec" , type_ident , [ type_params ] , "{" , field_list , "}" ;
sum_decl       = "sum" , type_ident , [ type_params ] , "{" , variant_list , "}" ;

type_params    = "[" , type_param , { "," , type_param } , "]" ;
type_param     = type_ident , [ ":" , constraint ] ;
constraint     = type_ident , { "+" , type_ident } ;

field_list     = field , { "," , field } , [ "," ] ;
field          = ident , ":" , type_expr ;

variant_list   = variant , { "," , variant } , [ "," ] ;
variant        = type_ident , [ "(" , type_expr , { "," , type_expr } , ")" ] ;

type_expr      = base_type | array_type | tuple_type | fn_type | refined_type 
               | effect_type | type_app | "(" , type_expr , ")" ;
base_type      = "Bool" | "ℤ" | "Int" | "ℕ" | "Nat" | "ℝ" | "Float" 
               | "Str" | "()" | "Unit" | "unknown" | "never" | type_ident ;
array_type     = "[" , type_expr , "]" ;
tuple_type     = "(" , type_expr , "," , type_expr , { "," , type_expr } , ")" ;
fn_type        = "(" , [ type_expr , { "," , type_expr } ] , ")" , "→" , type_expr ;
refined_type   = type_expr , "{" , predicate , "}" ;
effect_type    = type_ident , "[" , type_expr , "]" ;
type_app       = type_ident , "[" , type_expr , { "," , type_expr } , "]" ;

(* Functions *)
fn_decl        = "ƒ" , ident , [ type_params ] , "(" , [ param_list ] , ")" , 
                 "→" , type_expr , [ precond ] , [ postcond ] , block ;
param_list     = param , { "," , param } ;
param          = ident , ":" , type_expr ;
precond        = "pre" , expr ;
postcond       = "post" , expr ;

(* External *)
external_decl  = "external" , ( external_fn | external_mod ) ;
external_fn    = "ƒ" , ident , [ type_params ] , "(" , [ param_list ] , ")" , 
                 "→" , type_expr , "=" , string ;
external_mod   = "mod" , ident , "=" , string , "{" , { external_fn } , "}" ;

(* Expressions *)
expr           = literal | ident | unary_expr | binary_expr | call_expr 
               | index_expr | field_expr | lambda | if_expr | match_expr 
               | block | "(" , expr , ")" ;

literal        = int_lit | float_lit | string_lit | "true" | "false" | "()" ;
unary_expr     = unary_op , expr ;
unary_op       = "-" | "¬" | "!" ;
binary_expr    = expr , binary_op , expr ;
binary_op      = "+" | "-" | "*" | "/" | "%" | "^" | "==" | "≠" | "!=" 
               | "<" | ">" | "≤" | "<=" | "≥" | ">=" | "∧" | "&&" 
               | "∨" | "||" | "++" | "|>" ;
call_expr      = expr , "(" , [ expr , { "," , expr } ] , ")" ;
index_expr     = expr , "[" , expr , "]" ;
field_expr     = expr , "." , ident ;

lambda         = "λ" , lambda_params , "→" , expr ;
lambda_params  = ident | "(" , [ param_list ] , ")" ;

if_expr        = "if" , expr , block , [ "else" , ( if_expr | block ) ] ;
match_expr     = "match" , expr , "{" , match_arms , "}" ;
match_arms     = match_arm , { "," , match_arm } , [ "," ] ;
match_arm      = pattern , [ "if" , expr ] , "→" , expr ;

pattern        = "_" | literal | ident | tuple_pat | record_pat | variant_pat ;
tuple_pat      = "(" , pattern , "," , pattern , { "," , pattern } , ")" ;
record_pat     = "{" , field_pat , { "," , field_pat } , "}" ;
field_pat      = ident , [ ":" , pattern ] ;
variant_pat    = type_ident , [ "(" , pattern , { "," , pattern } , ")" ] ;

block          = "{" , { statement } , [ expr ] , "}" ;
statement      = let_stmt | assign_stmt | expr_stmt | for_stmt | while_stmt 
               | return_stmt | break_stmt | continue_stmt | assert_stmt ;
let_stmt       = "let" , [ "mut" ] , pattern , [ ":" , type_expr ] , "=" , expr ;
assign_stmt    = expr , "=" , expr ;
expr_stmt      = expr ;
for_stmt       = "for" , pattern , "in" , expr , block ;
while_stmt     = "while" , expr , block ;
return_stmt    = "return" , [ expr ] ;
break_stmt     = "break" ;
continue_stmt  = "continue" ;
assert_stmt    = "assert" , expr , [ ":" , string ] ;

(* Predicates - subset of expressions for refinements *)
predicate      = [ ident , "|" ] , pred_expr ;
pred_expr      = pred_term , { pred_binop , pred_term } ;
pred_term      = pred_atom | "(" , pred_expr , ")" | "¬" , pred_term ;
pred_atom      = ident | int_lit | pred_call | pred_comparison ;
pred_call      = ident , "(" , [ pred_expr , { "," , pred_expr } ] , ")" ;
pred_comparison = pred_expr , cmp_op , pred_expr ;
pred_binop     = "∧" | "∨" | "&&" | "||" ;
cmp_op         = "==" | "≠" | "!=" | "<" | ">" | "≤" | "<=" | "≥" | ">=" ;

(* Lexical *)
ident          = lower , { letter | digit | "_" } ;
type_ident     = upper , { letter | digit | "_" } ;
int_lit        = digit , { digit | "_" } , [ int_suffix ] ;
int_suffix     = "i32" | "i64" ;
float_lit      = digit , { digit } , "." , { digit } , [ exp_part ] ;
exp_part       = ( "e" | "E" ) , [ "+" | "-" ] , digit , { digit } ;
string         = '"' , { string_char } , '"' ;
string_char    = (* any char except '"' or '\' *) | escape_seq ;
escape_seq     = '\' , ( 'n' | 'r' | 't' | '\' | '"' | '0' ) ;
```

---

## Appendix B: Unicode Quick Reference

| Symbol | Input Method | Meaning |
|--------|--------------|---------|
| `ƒ` | Option+F (Mac), U+0192 | Function |
| `λ` | Option+L or \lambda | Lambda |
| `→` | Option+Right or -> | Arrow |
| `←` | Option+Left or <- | Left arrow |
| `ℤ` | U+2124 | Integer type |
| `ℕ` | U+2115 | Natural type |
| `ℝ` | U+211D | Real/Float type |
| `≠` | Option+= or != | Not equal |
| `≤` | Option+< or <= | Less or equal |
| `≥` | Option+> or >= | Greater or equal |
| `∧` | U+2227 or && | Logical and |
| `∨` | U+2228 or \|\| | Logical or |
| `¬` | Option+L or ! | Logical not |

---

*End of specification*
