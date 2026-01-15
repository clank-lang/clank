# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Clank is an agent-first programming language designed for LLM code generation. It compiles to JavaScript/TypeScript and runs on Bun. The language prioritizes rich compiler feedback over human ergonomics, featuring refinement types, effect tracking, and linear types.

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

The compiler produces structured JSON output with:
- Diagnostics (errors, warnings) with source locations
- Proof obligations with context and hints
- Type holes for incomplete code

Error codes follow the pattern: E0xxx (syntax), E1xxx (names), E2xxx (types), E3xxx (refinements), E4xxx (effects), E5xxx (linearity).

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
