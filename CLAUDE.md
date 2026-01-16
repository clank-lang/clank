# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clank is an **agent-oriented IR and compiler protocol** whose canonical program representation is **AST JSON**, not `.clank` text.

The compiler is a **repair engine** that minimizes agent↔compiler iterations by providing machine-actionable repair patches. The `.clank` text syntax exists for human debugging and inspection only.

**Key principles:**
- AST JSON is canonical; `.clank` is a debug view
- Every diagnostic includes repair candidates (patches) that agents can apply directly
- The compiler returns a canonical AST reflecting desugaring and normalization
- Runtime validators are inserted at boundaries with unknown types

**Status:** Implementation in progress.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         clank-compiler                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────┐   ┌────────┐   ┌───────────────┐   ┌───────────┐  │
│  │  Lexer  │ → │ Parser │ → │  Type Checker │ → │  Codegen  │  │
│  └─────────┘   └────────┘   └───────────────┘   └───────────┘  │
│                                    │                            │
│                             ┌──────┴──────┐                     │
│                             │   Solver    │                     │
│                             │ (refinements)│                     │
│                             └─────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
clank/
├── src/
│   ├── index.ts              # Main entry point
│   ├── cli.ts                # Command-line interface ✓
│   ├── lexer/                # Tokenization (Unicode + ASCII) ✓
│   │   ├── lexer.ts          # Main lexer implementation
│   │   ├── tokens.ts         # Token types and keywords
│   │   └── unicode.ts        # Unicode character utilities
│   ├── parser/               # Recursive descent parser ✓
│   │   ├── parser.ts         # Main parser implementation
│   │   ├── ast.ts            # AST node types
│   │   └── index.ts          # Public exports
│   ├── types/                # Type checker ✓
│   │   ├── checker.ts        # Bidirectional type checker
│   │   ├── types.ts          # Internal type representation
│   │   ├── context.ts        # Type environment/scopes
│   │   ├── unify.ts          # Unification algorithm
│   │   ├── convert.ts        # AST TypeExpr → semantic Type
│   │   └── builtins.ts       # Built-in function signatures
│   ├── refinements/          # Refinement type checking ✓
│   │   ├── solver.ts         # Constraint solver
│   │   ├── extract.ts        # AST → predicate extraction
│   │   └── context.ts        # Refinement fact tracking
│   ├── codegen/              # JavaScript code generation ✓
│   │   ├── emitter.ts        # AST → JavaScript
│   │   └── runtime.ts        # Runtime helpers
│   ├── diagnostics/          # Structured error output ✓
│   │   ├── diagnostic.ts     # Diagnostic types
│   │   ├── codes.ts          # Error code registry
│   │   ├── collector.ts      # Diagnostic collection
│   │   └── formatter.ts      # JSON and pretty-print output
│   ├── ast-json/             # AST-as-JSON for agents ✓
│   │   ├── schema.ts         # JSON schema for AST nodes
│   │   ├── serialize.ts      # AST → JSON conversion
│   │   ├── deserialize.ts    # JSON → AST conversion
│   │   └── index.ts          # Public exports
│   └── utils/                # Shared utilities ✓
│       ├── span.ts           # Source location tracking
│       ├── source.ts         # Source file handling
│       └── result.ts         # Result type utilities
├── tests/
│   ├── lexer/                # Lexer tests ✓
│   ├── parser/               # Parser tests ✓
│   ├── types/                # Type checker tests ✓
│   ├── codegen/              # Code generation tests ✓
│   └── refinements/          # Refinement tests ✓
├── docs/                     # Language specification
└── .mise.toml                # Bun toolchain config
```

## CLI Commands

```bash
clank compile main.clank -o dist/    # Compile to JavaScript
clank check main.clank               # Type check only
clank run main.clank                 # Compile and execute with Bun
clank compile main.clank --emit=json # Output structured diagnostics
clank compile main.clank --emit=ast  # Output AST as JSON
clank compile prog.json --input=ast  # Compile from AST JSON
```

## AST-as-JSON (Agent API)

The compiler supports bidirectional AST ↔ JSON conversion, enabling agents to:
1. **Read** the AST structure of existing code (`--emit=ast`)
2. **Generate** code by constructing JSON AST directly (`--input=ast`)
3. **Transform** code by reading AST, modifying it, and compiling back

### When to Use AST-as-JSON

| Use Case | Approach |
|----------|----------|
| Generate simple code | Write Clank source directly |
| Generate complex/dynamic code | Construct JSON AST |
| Analyze existing code structure | Use `--emit=ast` |
| Code transformation/refactoring | Read AST → modify → compile |
| Template-based generation | Mix AST nodes with source fragments |

### CLI Flags

```bash
# Output AST as JSON (instead of JavaScript)
clank compile main.clank --emit=ast > ast.json

# Compile from JSON AST input
clank compile program.json --input=ast -o dist/

# Round-trip: source → AST → JavaScript
clank compile main.clank --emit=ast | clank compile --input=ast -o dist/
```

### JSON Schema Overview

Every AST node has a `kind` field that identifies its type. Spans are optional on input (the compiler synthesizes them).

```typescript
// Program structure
{
  "kind": "program",
  "declarations": [...]  // Array of declarations
}

// Function declaration
{
  "kind": "fn",
  "name": "add",
  "params": [
    { "name": "a", "type": { "kind": "named", "name": "Int" } },
    { "name": "b", "type": { "kind": "named", "name": "Int" } }
  ],
  "returnType": { "kind": "named", "name": "Int" },
  "body": { "kind": "block", "statements": [], "expr": {...} }
}

// Expression kinds: literal, ident, binary, call, if, match, block, array, tuple, lambda, ...
// Type kinds: named, array, tuple, function, refined, effect, recordType
// Pattern kinds: wildcard, ident, literal, tuple, record, variant
```

### Key Node Types

| Category | Kinds |
|----------|-------|
| Declarations | `fn`, `rec`, `sum`, `typeAlias`, `externalFn`, `use`, `mod` |
| Expressions | `literal`, `ident`, `binary`, `unary`, `call`, `if`, `match`, `block`, `array`, `tuple`, `record`, `lambda`, `field`, `index`, `range`, `propagate` |
| Statements | `let`, `assign`, `expr`, `for`, `while`, `loop`, `return`, `break`, `continue`, `assert` |
| Types | `named`, `array`, `tuple`, `function`, `refined`, `effect`, `recordType` |
| Patterns | `wildcard`, `ident`, `literal`, `tuple`, `record`, `variant` |

### Hybrid Input: Source Fragments

Any AST node can be replaced with a source string using `{ "source": "..." }`. This is useful for:
- Complex expressions that are easier to write as source code
- Mixing generated structure with hand-written logic

```json
{
  "kind": "program",
  "declarations": [
    {
      "kind": "fn",
      "name": "greet",
      "params": [{ "name": "name", "type": { "source": "String" } }],
      "returnType": { "kind": "named", "name": "String" },
      "body": { "source": "{ \"Hello, \" ++ name }" }
    }
  ]
}
```

Source fragments work for: expressions, types, patterns, statements, and entire declarations.

### Literal Values

Integer literals use strings (JSON doesn't support BigInt):

```json
{ "kind": "literal", "value": { "kind": "int", "value": "42" } }
{ "kind": "literal", "value": { "kind": "float", "value": 3.14 } }
{ "kind": "literal", "value": { "kind": "string", "value": "hello" } }
{ "kind": "literal", "value": { "kind": "bool", "value": true } }
{ "kind": "literal", "value": { "kind": "unit" } }
```

### Example: Generate a Function

```json
{
  "kind": "program",
  "declarations": [
    {
      "kind": "fn",
      "name": "factorial",
      "params": [{ "name": "n", "type": { "kind": "named", "name": "Int" } }],
      "returnType": { "kind": "named", "name": "Int" },
      "body": {
        "kind": "block",
        "statements": [],
        "expr": {
          "kind": "if",
          "condition": {
            "kind": "binary",
            "op": "<=",
            "left": { "kind": "ident", "name": "n" },
            "right": { "kind": "literal", "value": { "kind": "int", "value": "1" } }
          },
          "thenBranch": {
            "kind": "block",
            "statements": [],
            "expr": { "kind": "literal", "value": { "kind": "int", "value": "1" } }
          },
          "elseBranch": {
            "kind": "block",
            "statements": [],
            "expr": { "source": "n * factorial(n - 1)" }
          }
        }
      }
    }
  ]
}
```

### Deserialization Errors

When JSON input is invalid, the compiler returns structured errors with JSON paths:

```json
{
  "ok": false,
  "errors": [
    { "path": "$.declarations[0].params[0]", "message": "Missing required field: type" }
  ]
}
```

### Serialization Options

When outputting AST (`--emit=ast`), the compiler uses:
- `includeSpans: true` - Include source location spans
- `pretty: true` - Human-readable indentation

Programmatic API:
```typescript
import { serializeProgram, deserializeProgram } from "./ast-json";

// AST → JSON string
const json = serializeProgram(program, { pretty: true, includeSpans: false });

// JSON string → AST
const result = deserializeProgram(json);
if (result.ok) {
  const program = result.value;
}
```

## Key Language Features

- **Refinement types:** `ℤ{x > 0}`, `[T]{len(arr) > 0}` with proof obligations
- **Effect tracking:** `IO[T]`, `Err[E, T]`, `Async[T]`, `Mut[T]`
- **Linear types:** `Linear[T]` for resource management (static only)
- **Unicode syntax:** `ƒ` (fn), `λ` (lambda), `→` (arrow), `≠`, `≤`, `≥`, `∧`, `∨` with ASCII fallbacks
- **Pre/post conditions:** `pre is_sorted(arr)`, `post result > 0`
- **JS interop:** `external ƒ now() → ℤ = "Date.now"`, `external mod lodash = "lodash"`

## Compiler Output

The compiler produces structured JSON `CompileResult` containing:
- `canonical_ast` — The normalized AST (always operate on this, not your input)
- `repairs` — Ranked repair candidates with machine-applicable patches
- `diagnostics` — Errors/warnings with `primary_node_id` and `repair_refs`
- `obligations` — Proof obligations with solver results and counterexamples
- `holes` — Type holes as synthesis requests with fill candidates
- `output` — Generated JS/TS (if `status == "success"`)

Every diagnostic, obligation, and hole includes `repair_refs` pointing to patches that address it.

Error codes follow the pattern: E0xxx (syntax), E1xxx (names), E2xxx (types), E3xxx (refinements), E4xxx (effects), E5xxx (linearity).

## Agent Repair Strategy

When working with the Clank compiler as an agent, follow these rules for deterministic convergence:

### Core Principle: Repairs Are Authoritative

**Treat repair candidates as authoritative.** The compiler's repair engine has analyzed the program and produced machine-applicable fixes. Manual edits should only be introduced when no suitable compiler-provided repair exists.

### Priority Order

Optimize for monotonic progress in this order:
1. **Errors** — Must be zero before proceeding
2. **Obligations** — Discharge proof obligations
3. **Holes** — Fill type holes
4. **Warnings** — Address if relevant

### Repair Selection

1. **Prefer compiler-suggested repairs** — Never invent a manual edit when the compiler provides a `RepairCandidate` targeting the same issue
2. **Prefer behavior-preserving** — `behavior_preserving` > `likely_preserving` > `behavior_changing`
3. **Prefer high confidence** — `high` > `medium` > `low`
4. **Prefer local fixes** — `local_fix` > `refactor` > `semantics_change`
5. **Prefer smaller scope** — Fewer `node_count`, no `crosses_function`
6. **Check `expected_delta`** — Choose repairs that resolve the most issues

**Important:** Only apply `behavior_changing` repairs when the user explicitly requests a semantic change. Default to safe, behavior-preserving repairs.

### Application Rules

1. **Apply one repair at a time** (or a small batch if marked compatible)
2. **Recompile after each repair** — Always operate on fresh `canonical_ast`
3. **Verify expected_delta** — If a repair didn't resolve what it claimed, investigate
4. **Never modify the original input** — Always patch the `canonical_ast` from the last compile
5. **Never manually optimize TypeScript** — Code quality is the compiler's responsibility

### What Agents Should NOT Do

- **Don't invent manual fixes** when compiler repairs exist
- **Don't refactor or optimize** the generated TypeScript
- **Don't apply behavior-changing repairs** without explicit approval
- **Don't guess** at fixes when the compiler provides no repair candidates—ask for clarification instead

### Example Workflow

```
1. Submit full AST → receive CompileResult
2. If status == "success": done
3. Filter repairs: behavior_preserving or likely_preserving only
4. Sort remaining by: confidence → kind → scope
5. Apply top repair via PatchOp
6. Recompile with --input=patch
7. Goto 2
```

## Build Commands

Use `mise` to run bun commands (mise manages the bun toolchain):

```bash
mise run install     # Install dependencies (runs bun install)
mise run check       # Type check with TypeScript
mise run test        # Run all tests
mise run test:lexer  # Run lexer tests only
mise run dev <file>  # Run compiler in dev mode
```

Or use `mise exec` to run bun directly:

```bash
mise exec -- bun install
mise exec -- bun test
```

## Development Notes

- **Bun is both the toolchain and target runtime** - we use Bun for building, testing, and running the compiler, and Clank programs compile to JS that runs on Bun
- Minimal dependencies philosophy - compiler should be self-contained
- Bidirectional type checking with Hindley-Milner inference for generics
- Built-in constraint solver for refinements (SMT/Z3 is post-MVP)

## Implementation Standards

- **Never leave things half-implemented, stubbed, or with TODOs** - complete each assigned feature or component fully
- Ask for clarification if something is blocking implementation rather than guessing or leaving incomplete

### Feature Development Rules

These rules are non-negotiable for new language features:

1. **Repair-first design** — Every new feature must ship with at least one canonical repair pattern. If we can't define deterministic repairs for a feature's error cases, the feature is not ready to implement.

2. **No partial implementations** — Features without deterministic repairs should be postponed entirely. A feature that produces diagnostics without actionable repairs degrades the agent experience and violates the project's core value proposition.

3. **Solver coverage requirement** — If a feature produces frequent `unknown` solver results without counterexamples, that's a design smell. Either simplify the feature's semantics or enhance the solver first—don't ship features that produce unprovable obligations without guidance.
